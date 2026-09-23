#!/usr/bin/env python3
"""Worker de sincronização cadastral com os Dados Abertos do CNPJ/RFB.

Executado pelo GitHub Actions. Não usa segredo persistente: autentica na Edge
Function por OIDC do próprio GitHub Actions.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
import time
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urljoin
from urllib.request import Request, urlopen

OFFICIAL_BASE_URL = "https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/"
MIRROR_INDEX_URL = "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/"
EDGE_URL = os.environ.get(
    "CNPJ_SYNC_EDGE_URL",
    "https://xogfqpeubtcqehaadywm.supabase.co/functions/v1/cnpj-sync-worker",
)
USER_AGENT = "RadarCRM-CNPJ-Sync/1.0 (+https://github.com/beatrizmoreira190/radar-crm)"
WORKDIR = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "radar-cnpj-sync"
BATCH_SIZE = 150


def log(message: str) -> None:
    print(message, flush=True)


def normalize_cnpj(value: Any) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", str(value or "")).upper()


def request_bytes(url: str, *, method: str = "GET", data: bytes | None = None,
                  headers: dict[str, str] | None = None, timeout: int = 120,
                  retries: int = 5) -> bytes:
    all_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, data=data, headers=all_headers, method=method)
            with urlopen(req, timeout=timeout) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError) as exc:
            last = exc
            if isinstance(exc, HTTPError) and exc.code in (400, 401, 403, 404):
                raise
            if attempt < retries:
                wait = min(30, attempt * 5)
                log(f"Falha temporária em {url} (tentativa {attempt}/{retries}); nova tentativa em {wait}s.")
                time.sleep(wait)
    raise RuntimeError(f"Não foi possível acessar {url}: {last}")


def request_json(url: str, payload: dict[str, Any], headers: dict[str, str] | None = None,
                 retries: int = 4) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    raw = request_bytes(
        url,
        method="POST",
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        retries=retries,
        timeout=120,
    )
    return json.loads(raw.decode("utf-8"))


def github_oidc_token() -> str:
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not request_url or not request_token:
        raise RuntimeError("OIDC do GitHub Actions não está disponível.")
    sep = "&" if "?" in request_url else "?"
    url = f"{request_url}{sep}audience={quote('radar-cnpj-sync')}"
    raw = request_bytes(
        url,
        headers={"Authorization": f"Bearer {request_token}"},
        retries=3,
        timeout=60,
    )
    value = json.loads(raw.decode("utf-8")).get("value")
    if not value:
        raise RuntimeError("GitHub não retornou o token OIDC.")
    return value


def edge_call(action: str, **payload: Any) -> dict[str, Any]:
    token = github_oidc_token()
    result = request_json(
        EDGE_URL,
        {"action": action, **payload},
        headers={"Authorization": f"Bearer {token}"},
    )
    if result.get("error"):
        raise RuntimeError(f"Edge Function: {result['error']}")
    return result


def progress(run_id: str, stage: str, pct: int, message: str | None = None,
             source_period: str | None = None, source_url: str | None = None) -> None:
    edge_call(
        "progress",
        run_id=run_id,
        stage=stage,
        progress=pct,
        message=message,
        source_period=source_period,
        source_url=source_url,
    )


def directory_zip_files(directory: str) -> list[str]:
    html = request_bytes(directory, timeout=60, retries=4).decode("latin1", "ignore")
    hrefs = re.findall(r'href=["\']([^"\']+\.zip)["\']', html, flags=re.I)
    names = []
    for href in hrefs:
        name = unquote(href.rsplit("/", 1)[-1])
        if name.lower().endswith(".zip"):
            names.append(name)
    return sorted(set(names))


def mirror_snapshots() -> list[str]:
    html = request_bytes(MIRROR_INDEX_URL, timeout=60, retries=4).decode("latin1", "ignore")
    stamps = re.findall(r'href=["\'](20\d{2}-\d{2}-\d{2})/["\']', html, flags=re.I)
    today = datetime.now(timezone.utc).date().isoformat()
    return sorted({stamp for stamp in stamps if stamp <= today}, reverse=True)


def has_required_files(files: list[str]) -> bool:
    lower = [name.lower() for name in files]
    return (
        any(name.startswith("estabelecimentos") for name in lower)
        and any(name.startswith("empresas") for name in lower)
        and any(name == "cnaes.zip" for name in lower)
        and any(name == "municipios.zip" for name in lower)
        and any(name == "naturezas.zip" for name in lower)
        and any(name == "simples.zip" for name in lower)
    )


def discover_latest_period() -> tuple[str, str, list[str]]:
    """Localiza a cópia mensal mais recente dos Dados Abertos do CNPJ.

    O host de arquivos da RFB tem encerrado conexões vindas de alguns ranges de
    cloud/CI. Para tornar a rotina confiável, usamos o espelho público da Casa
    dos Dados, que declara copiar mensalmente os arquivos originais da Receita.
    """
    errors: list[str] = []
    snapshots = mirror_snapshots()
    if not snapshots:
        raise RuntimeError("O espelho dos Dados Abertos do CNPJ não listou competências disponíveis.")

    for stamp in snapshots[:8]:
        directory = urljoin(MIRROR_INDEX_URL, f"{stamp}/")
        try:
            files = directory_zip_files(directory)
            if has_required_files(files):
                return stamp[:7], directory, files
            errors.append(f"{stamp}: diretório incompleto")
        except Exception as exc:
            errors.append(f"{stamp}: {exc}")

    raise RuntimeError("Não encontrei uma competência completa da base CNPJ no espelho público. " + " | ".join(errors[-4:]))


def natural_key(name: str) -> tuple[str, int]:
    m = re.search(r"(\d+)(?=\.zip$)", name, re.I)
    return (re.sub(r"\d+(?=\.zip$)", "", name.lower()), int(m.group(1)) if m else -1)


def files_with_prefix(files: list[str], prefix: str) -> list[str]:
    found = [f for f in files if f.lower().startswith(prefix.lower()) and f.lower().endswith(".zip")]
    return sorted(found, key=natural_key)


def exact_file(files: list[str], wanted: str) -> str:
    for name in files:
        if name.lower() == wanted.lower():
            return name
    raise RuntimeError(f"Arquivo obrigatório não encontrado na base da Receita: {wanted}")


def download_file(url: str, destination: Path, retries: int = 5) -> None:
    last: Exception | None = None
    destination.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=180) as response, destination.open("wb") as out:
                total = int(response.headers.get("Content-Length") or 0)
                written = 0
                while True:
                    chunk = response.read(4 * 1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    written += len(chunk)
                if total and written != total:
                    raise IOError(f"download incompleto: {written}/{total} bytes")
            return
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last = exc
            destination.unlink(missing_ok=True)
            if attempt < retries:
                wait = min(45, attempt * 8)
                log(f"Download falhou ({attempt}/{retries}) para {url}; repetindo em {wait}s.")
                time.sleep(wait)
    raise RuntimeError(f"Falha ao baixar {url}: {last}")


def rows_from_zip(path: Path):
    with zipfile.ZipFile(path) as zf:
        members = [n for n in zf.namelist() if not n.endswith("/")]
        if not members:
            return
        member = max(members, key=lambda n: zf.getinfo(n).file_size)
        with zf.open(member) as raw:
            text = io.TextIOWrapper(raw, encoding="latin1", errors="replace", newline="")
            yield from csv.reader(text, delimiter=";")


def load_lookup(directory: str, files: list[str], filename: str) -> dict[str, str]:
    path = WORKDIR / filename
    download_file(urljoin(directory, exact_file(files, filename)), path)
    mapping: dict[str, str] = {}
    try:
        for row in rows_from_zip(path):
            if len(row) >= 2:
                code = row[0].strip()
                desc = row[1].strip()
                if code:
                    mapping[code] = desc
    finally:
        path.unlink(missing_ok=True)
    return mapping


def parse_date(value: str | None) -> str | None:
    s = re.sub(r"\D", "", value or "")
    if len(s) != 8 or s == "00000000":
        return None
    try:
        return datetime.strptime(s, "%Y%m%d").date().isoformat()
    except ValueError:
        return None


def format_cep(value: str | None) -> str | None:
    s = re.sub(r"\D", "", value or "")
    if len(s) == 8:
        return f"{s[:2]}.{s[2:5]}-{s[5:]}"
    return (value or "").strip() or None


def phone(ddd: str | None, number: str | None) -> str | None:
    d = re.sub(r"\D", "", ddd or "")
    n = re.sub(r"\D", "", number or "")
    if not n:
        return None
    return f"{d}{n}" if d else n


def format_brl(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        amount = Decimal(raw.replace(".", "").replace(",", "."))
    except InvalidOperation:
        return raw
    rendered = f"{amount:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"R$\u00a0{rendered}"


def yes_no(value: str | None) -> str | None:
    v = (value or "").strip().upper()
    if v == "S":
        return "Sim"
    if v == "N":
        return "Não"
    return None


def process_bulk_zip(directory: str, filename: str, callback) -> None:
    path = WORKDIR / filename
    download_file(urljoin(directory, filename), path)
    try:
        for row in rows_from_zip(path):
            callback(row)
    finally:
        path.unlink(missing_ok=True)


def main() -> int:
    WORKDIR.mkdir(parents=True, exist_ok=True)
    claim = edge_call("claim")
    run = claim.get("run")
    if not run:
        log("Nenhuma atualização cadastral aguardando processamento.")
        return 0

    run_id = str(run["id"])
    targets = claim.get("targets") or []
    target_by_cnpj = {
        normalize_cnpj(item.get("cnpj")): str(item.get("publisher_id"))
        for item in targets
        if normalize_cnpj(item.get("cnpj"))
    }
    target_basics = {cnpj[:8] for cnpj in target_by_cnpj}
    log(f"Execução {run_id}: {len(target_by_cnpj)} CNPJs na fila.")

    try:
        progress(run_id, "Localizando base da Receita Federal", 4)
        period, directory, files = discover_latest_period()
        progress(
            run_id,
            "Carregando tabelas de domínio",
            7,
            f"Base pública localizada: {period}.",
            source_period=period,
            source_url=directory,
        )
        log(f"Base selecionada: {period} — {directory}")

        cnaes = load_lookup(directory, files, "Cnaes.zip")
        municipios = load_lookup(directory, files, "Municipios.zip")
        naturezas = load_lookup(directory, files, "Naturezas.zip")
        paises = load_lookup(directory, files, "Paises.zip")
        motivos = load_lookup(directory, files, "Motivos.zip")

        establishments: dict[str, dict[str, str]] = {}
        branch_counts: dict[str, int] = defaultdict(int)
        estab_files = files_with_prefix(files, "Estabelecimentos")
        if not estab_files:
            raise RuntimeError("Nenhum arquivo de estabelecimentos encontrado.")

        for idx, filename in enumerate(estab_files, 1):
            def on_estab(row: list[str]) -> None:
                if len(row) < 30:
                    return
                basic = normalize_cnpj(row[0])[:8]
                if basic not in target_basics:
                    return
                if row[3].strip() == "2":
                    branch_counts[basic] += 1
                full = normalize_cnpj(row[0] + row[1] + row[2])
                if full in target_by_cnpj:
                    establishments[full] = {
                        "basic": basic,
                        "matrix": row[3].strip(),
                        "trade_name": row[4].strip(),
                        "status": row[5].strip(),
                        "status_date": row[6].strip(),
                        "status_reason": row[7].strip(),
                        "foreign_city": row[8].strip(),
                        "country_code": row[9].strip(),
                        "start_date": row[10].strip(),
                        "cnae_primary": row[11].strip(),
                        "cnae_secondary": row[12].strip(),
                        "address_type": row[13].strip(),
                        "address_street": row[14].strip(),
                        "address_number": row[15].strip(),
                        "address_complement": row[16].strip(),
                        "neighborhood": row[17].strip(),
                        "postal_code": row[18].strip(),
                        "state": row[19].strip(),
                        "municipality_code": row[20].strip(),
                        "ddd1": row[21].strip(),
                        "phone1": row[22].strip(),
                        "ddd2": row[23].strip(),
                        "phone2": row[24].strip(),
                        "email": row[27].strip(),
                        "special_status": row[28].strip(),
                        "special_status_date": row[29].strip(),
                    }

            process_bulk_zip(directory, filename, on_estab)
            pct = 9 + round(27 * idx / len(estab_files))
            progress(
                run_id,
                "Lendo estabelecimentos da Receita",
                pct,
                f"{idx}/{len(estab_files)} arquivos de estabelecimentos processados.",
                source_period=period,
                source_url=directory,
            )
            log(f"Estabelecimentos {idx}/{len(estab_files)}: {len(establishments)} CNPJs localizados.")

        companies: dict[str, dict[str, str]] = {}
        company_files = files_with_prefix(files, "Empresas")
        if not company_files:
            raise RuntimeError("Nenhum arquivo de empresas encontrado.")
        for idx, filename in enumerate(company_files, 1):
            def on_company(row: list[str]) -> None:
                if len(row) < 7:
                    return
                basic = normalize_cnpj(row[0])[:8]
                if basic in target_basics:
                    companies[basic] = {
                        "legal_name": row[1].strip(),
                        "legal_nature": row[2].strip(),
                        "share_capital": row[4].strip(),
                        "company_size": row[5].strip(),
                    }

            process_bulk_zip(directory, filename, on_company)
            pct = 36 + round(14 * idx / len(company_files))
            progress(
                run_id,
                "Lendo empresas da Receita",
                pct,
                f"{idx}/{len(company_files)} arquivos de empresas processados.",
                source_period=period,
                source_url=directory,
            )

        simples: dict[str, dict[str, str]] = {}
        simples_file = exact_file(files, "Simples.zip")
        def on_simples(row: list[str]) -> None:
            if len(row) < 7:
                return
            basic = normalize_cnpj(row[0])[:8]
            if basic in target_basics:
                simples[basic] = {"simples": row[1].strip(), "mei": row[4].strip()}

        process_bulk_zip(directory, simples_file, on_simples)
        progress(run_id, "Lendo Simples Nacional e MEI", 54, source_period=period, source_url=directory)

        owners: dict[str, list[str]] = defaultdict(list)
        owner_seen: dict[str, set[str]] = defaultdict(set)
        socios_files = files_with_prefix(files, "Socios")
        for idx, filename in enumerate(socios_files, 1):
            def on_owner(row: list[str]) -> None:
                if len(row) < 3:
                    return
                basic = normalize_cnpj(row[0])[:8]
                if basic not in target_basics:
                    return
                name = row[2].strip()
                if name and name not in owner_seen[basic]:
                    owner_seen[basic].add(name)
                    owners[basic].append(name)

            process_bulk_zip(directory, filename, on_owner)
            pct = 55 + round(15 * idx / max(len(socios_files), 1))
            progress(
                run_id,
                "Lendo quadro societário",
                pct,
                f"{idx}/{len(socios_files)} arquivos de sócios processados.",
                source_period=period,
                source_url=directory,
            )

        status_map = {
            "1": "NULA", "01": "NULA",
            "2": "ATIVA", "02": "ATIVA",
            "3": "SUSPENSA", "03": "SUSPENSA",
            "4": "INAPTA", "04": "INAPTA",
            "8": "BAIXADA", "08": "BAIXADA",
        }
        size_map = {
            "00": "NÃO INFORMADO", "0": "NÃO INFORMADO",
            "01": "MICRO EMPRESA", "1": "MICRO EMPRESA",
            "03": "EMPRESA DE PEQUENO PORTE", "3": "EMPRESA DE PEQUENO PORTE",
            "05": "DEMAIS", "5": "DEMAIS",
        }

        rows: list[dict[str, Any]] = []
        incomplete = 0
        for cnpj, publisher_id in target_by_cnpj.items():
            estab = establishments.get(cnpj)
            if not estab:
                continue
            company = companies.get(estab["basic"])
            if not company:
                incomplete += 1
                continue

            basic = estab["basic"]
            country_code = estab["country_code"]
            foreign = bool(estab["foreign_city"] or country_code)
            country = (paises.get(country_code) or country_code) if foreign else "Brasil"
            city = estab["foreign_city"] if estab["foreign_city"] else municipios.get(estab["municipality_code"])
            primary = estab["cnae_primary"]
            matrix = "Filial"
            if estab["matrix"] == "1":
                count = branch_counts.get(basic, 0)
                matrix = f"Matriz com {count} {'Filial' if count == 1 else 'Filiais'}"

            rows.append({
                "publisher_id": publisher_id,
                "cnpj": cnpj,
                "legal_name": company["legal_name"] or None,
                "trade_name": estab["trade_name"] or None,
                "country": country or None,
                "city": city or None,
                "state": estab["state"] or None,
                "postal_code": format_cep(estab["postal_code"]),
                "address_type": estab["address_type"] or None,
                "address_street": estab["address_street"] or None,
                "address_number": estab["address_number"] or None,
                "address_complement": estab["address_complement"] or None,
                "neighborhood": estab["neighborhood"] or None,
                "phone": phone(estab["ddd1"], estab["phone1"]),
                "secondary_phone": phone(estab["ddd2"], estab["phone2"]),
                "general_email": estab["email"].lower() or None,
                "cnae_primary": primary or None,
                "cnae_description": cnaes.get(primary) or None,
                "cnae_secondary": estab["cnae_secondary"] or None,
                "matrix_branch": matrix,
                "registration_status": status_map.get(estab["status"], estab["status"] or None),
                "legal_nature": naturezas.get(company["legal_nature"]) or company["legal_nature"] or None,
                "company_size": size_map.get(company["company_size"], company["company_size"] or None),
                "share_capital": format_brl(company["share_capital"]),
                "owners_names": " - ".join(owners.get(basic, [])) or None,
                "simples_nacional": yes_no(simples.get(basic, {}).get("simples")),
                "mei": yes_no(simples.get(basic, {}).get("mei")),
                "cnpj_status_date": parse_date(estab["status_date"]),
                "cnpj_status_reason": motivos.get(estab["status_reason"]) or estab["status_reason"] or None,
                "cnpj_start_date": parse_date(estab["start_date"]),
                "cnpj_special_status": estab["special_status"] or None,
                "cnpj_special_status_date": parse_date(estab["special_status_date"]),
            })

        progress(
            run_id,
            "Aplicando atualização no CRM",
            74,
            f"{len(rows)} CNPJs localizados; preparando gravação segura.",
            source_period=period,
            source_url=directory,
        )

        total_batches = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE
        for batch_index, start in enumerate(range(0, len(rows), BATCH_SIZE), 1):
            batch = rows[start:start + BATCH_SIZE]
            edge_call(
                "apply_batch",
                run_id=run_id,
                rows=batch,
                source_period=period,
            )
            if batch_index == total_batches or batch_index % 5 == 0:
                pct = 74 + round(23 * batch_index / max(total_batches, 1))
                progress(
                    run_id,
                    "Atualizando editoras no CRM",
                    min(pct, 97),
                    f"Lote {batch_index}/{total_batches} aplicado.",
                    source_period=period,
                    source_url=directory,
                )

        metadata = {
            "official_source": OFFICIAL_BASE_URL,
            "delivery_source": "Casa dos Dados - espelho público dos Dados Abertos da RFB",
            "targets": len(target_by_cnpj),
            "records_prepared": len(rows),
            "establishments_found": len(establishments),
            "companies_found": len(companies),
            "incomplete_records": incomplete,
            "establishment_files": len(estab_files),
            "company_files": len(company_files),
            "partner_files": len(socios_files),
        }
        result = edge_call(
            "finish",
            run_id=run_id,
            source_period=period,
            source_url=directory,
            metadata=metadata,
        )
        final_run = result.get("run") or {}
        log(
            "Sincronização concluída: "
            f"{final_run.get('matched_publishers', 0)} encontrados, "
            f"{final_run.get('updated_publishers', 0)} atualizados, "
            f"{final_run.get('not_found_publishers', 0)} não encontrados, "
            f"{final_run.get('error_publishers', 0)} erros."
        )
        return 0

    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        log(f"ERRO: {message}")
        try:
            edge_call("fail", run_id=run_id, message=message)
        except Exception as fail_exc:
            log(f"Também não foi possível registrar a falha no CRM: {fail_exc}")
        raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
