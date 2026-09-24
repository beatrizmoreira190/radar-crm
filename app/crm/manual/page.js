import Link from 'next/link';
import { BookOpenCheck } from 'lucide-react';

const sections=[
  ['inicio','Como usar o CRM'],
  ['conceitos','Conceitos fundamentais'],
  ['permissoes','Perfis e permissões'],
  ['visao-geral','Visão geral'],
  ['prioridades','Prioridades e Radar Score'],
  ['editoras','Base de editoras'],
  ['nova-editora','Nova editora'],
  ['ficha','Ficha da editora'],
  ['relacionamento','Pessoas e interações'],
  ['oportunidades','Oportunidades'],
  ['pipeline','Pipeline'],
  ['tarefas','Minha fila'],
  ['notificacoes','Notificações e menções'],
  ['cadencias','Cadências'],
  ['modelos','Modelos comerciais'],
  ['agenda','Agenda comercial'],
  ['reunioes','Reuniões e pós-reunião'],
  ['materiais','Materiais comerciais'],
  ['desempenho','Desempenho e metas'],
  ['relatorios','Relatórios e Excel'],
  ['atividade','Atividade'],
  ['qualidade','Qualidade da base'],
  ['importar','Importação'],
  ['equipe','Equipe e funções'],
  ['perfil','Meu perfil e Google Agenda'],
  ['boas-praticas','Boas práticas'],
  ['problemas','Problemas comuns'],
  ['faq','FAQ']
];

export default function ManualPage(){
  return <div className="page-wrap">
    <div className="page-head">
      <div>
        <div className="eyebrow">Guia de uso</div>
        <h1>Manual do CRM</h1>
        <p>Referência operacional para usar o Radar CRM com consistência: o que cada tela faz, onde registrar cada informação, quem pode executar cada ação e como manter a base confiável.</p>
      </div>
      <BookOpenCheck size={28}/>
    </div>

    <div className="manual-intro card panel">
      <strong>Como consultar este manual</strong>
      <p>Se você está começando, leia primeiro <a href="#inicio">Como usar o CRM</a>, <a href="#conceitos">Conceitos fundamentais</a> e <a href="#permissoes">Perfis e permissões</a>. Depois, consulte a seção da tela em que estiver trabalhando. Os nomes usados aqui seguem os nomes atuais da interface.</p>
    </div>

    <div className="manual-layout">
      <nav className="card manual-nav" aria-label="Índice do manual">
        {sections.map(([id,label])=><a key={id} href={'#'+id}>{label}</a>)}
      </nav>

      <div className="manual-content">
        <Section id="inicio" title="Como usar o CRM no dia a dia">
          <p>O CRM acompanha a jornada comercial de cada editora e organiza o trabalho da equipe. A lógica principal é simples: <b>entender a conta → executar uma ação → registrar o que aconteceu → definir o próximo passo</b>.</p>
          <Callout title="Rotina recomendada para começar o dia">
            <ol>
              <li>Abra <Link className="text-link" href="/app">Visão geral</Link> para enxergar rapidamente tarefas, responsabilidade atual, atividade e situação do pipeline.</li>
              <li>Entre em <Link className="text-link" href="/app/prioridades">Prioridades</Link> para decidir quais editoras merecem atenção primeiro.</li>
              <li>Use <Link className="text-link" href="/app/tarefas">Minha fila</Link> para executar tarefas, follow-ups e lembretes.</li>
              <li>Antes de falar com uma editora, abra a ficha e leia <b>Visão da conta</b>, <b>Contato rápido</b>, histórico e Radar Score.</li>
              <li>Depois da ação, registre a interação, atualize o próximo passo e crie oportunidade, reunião ou tarefa somente quando fizer sentido.</li>
            </ol>
          </Callout>
          <p>Gestores podem usar a mesma rotina, mas também consultam as visões consolidadas de equipe, Qualidade da base, importação, desempenho e relatórios.</p>
        </Section>

        <Section id="conceitos" title="Conceitos fundamentais: onde registrar cada coisa">
          <p>Grande parte da qualidade do CRM depende de registrar a informação no lugar correto. Os campos abaixo têm funções diferentes.</p>
          <div className="manual-definition-grid">
            <Definition term="Editora / conta">É o cadastro principal da empresa. Reúne dados cadastrais, perfil editorial, acompanhamento comercial e todo o histórico relacionado.</Definition>
            <Definition term="Prospector de origem">É a pessoa que iniciou a prospecção da editora. Esse vínculo é histórico: continua preservado mesmo quando a condução comercial passa para outra pessoa.</Definition>
            <Definition term="Responsável atual">É quem está com a condução do próximo estágio comercial naquele momento. Pode mudar ao longo da jornada sem apagar quem originou a conta.</Definition>
            <Definition term="Pessoa de contato">É uma pessoa da editora: nome, cargo, área, e-mail, telefone e indicação de decisor. Não é o registro de uma conversa.</Definition>
            <Definition term="Interação">É algo que aconteceu: ligação, e-mail, WhatsApp, LinkedIn, reunião ou outra abordagem. Deve registrar resultado, resumo e próximo passo.</Definition>
            <Definition term="Tarefa">É algo que ainda precisa ser feito. Pode ser manual ou criada automaticamente por reunião, follow-up ou cadência.</Definition>
            <Definition term="Oportunidade">É uma possibilidade concreta de negócio. Registra o serviço da Radar, a etapa, os dados operacionais específicos daquele serviço, a previsão de conclusão e o próximo passo. O CRM não armazena valores comerciais nem probabilidade de fechamento.</Definition>
            <Definition term="Etapa do Pipeline">Representa a situação comercial geral da editora no funil da Radar. Não é a mesma coisa que a etapa de uma oportunidade.</Definition>
            <Definition term="Prioridade manual">Baixa, Média, Alta ou Urgente. Ajusta a atenção operacional, mas não substitui prazos vencidos nem o Radar Score.</Definition>
            <Definition term="Radar Score">Pontuação calculada por regras do CRM para ajudar a interpretar aderência e potencial. Não é uma decisão automática sobre abordar ou não uma editora.</Definition>
            <Definition term="Cadência">Sequência planejada de tarefas em dias diferentes, usada para dar ritmo à prospecção.</Definition>
            <Definition term="Material comercial">Link para apresentação, proposta, curadoria, projeto ou outro material. O arquivo continua na plataforma de origem.</Definition>
          </div>
          <Callout title="Regra prática" tone="warning">
            <p><b>O que aconteceu</b> vai para Interações. <b>O que precisa acontecer</b> vai para Tarefas ou Próxima ação. <b>Informação duradoura da conta</b> pode ir para Notas. <b>Possibilidade concreta de negócio</b> vai para Oportunidades.</p>
          </Callout>
        </Section>

        <Section id="permissoes" title="Perfis, funções comerciais e permissões">
          <p>O CRM separa <b>nível de acesso</b> de <b>função comercial</b>. O nível de acesso define o alcance administrativo; as funções comerciais descrevem o papel operacional da pessoa.</p>
          <h3>Níveis de acesso</h3>
          <div className="manual-table-wrap"><table className="manual-table">
            <thead><tr><th>Perfil</th><th>Uso principal</th><th>Escopo</th></tr></thead>
            <tbody>
              <tr><td>Prospectador</td><td>Prospecção e acompanhamento diário</td><td>Colabora nas editoras conforme suas funções comerciais e pode assumir a responsabilidade atual de contas disponíveis.</td></tr>
              <tr><td>Supervisor</td><td>Acompanhamento da operação</td><td>Tem visão consolidada e acesso às áreas de gestão, sem administrar acessos da equipe.</td></tr>
              <tr><td>Administrador</td><td>Gestão completa do CRM</td><td>Gerencia equipe, acessos, funções, integrações e demais áreas de gestão.</td></tr>
              <tr><td>Administrador geral</td><td>Administração principal</td><td>Equivale ao nível administrativo mais alto da organização.</td></tr>
            </tbody>
          </table></div>
          <h3>Funções comerciais</h3>
          <ul>
            <li><b>Prospecção:</b> identifica quem atua diretamente na abordagem e acompanhamento de editoras.</li>
            <li><b>Agendamento de reuniões:</b> libera o fluxo operacional de agendamento.</li>
            <li><b>Apresentação comercial:</b> identifica quem pode ser escolhido como apresentador e ter regras de disponibilidade.</li>
            <li><b>Materiais pré-reunião:</b> identifica quem prepara materiais antes das apresentações.</li>
            <li><b>Materiais de negociação:</b> identifica quem prepara propostas, projetos e materiais de apoio à negociação.</li>
          </ul>
          <h3>Permissões importantes na interface atual</h3>
          <div className="manual-table-wrap"><table className="manual-table">
            <thead><tr><th>Ação</th><th>Quem vê / executa</th></tr></thead>
            <tbody>
              <tr><td>Criar nova editora</td><td>Todos os usuários ativos do CRM. Alguns campos de gestão, como Responsável atual e Perfil comercial Radar, continuam restritos a gestores.</td></tr>
              <tr><td>Editar etapa, prioridade, responsável atual, próxima ação principal e notas estruturantes</td><td>Gestores ou responsável atual pela editora.</td></tr>
              <tr><td>Registrar interação, criar tarefa, oportunidade e pessoa de contato pela ficha</td><td>Gestores, responsável atual ou usuário com função Prospecção. A autoria de cada registro fica preservada.</td></tr>
              <tr><td>Agendar reunião</td><td>Gestores ou usuário com função Agendamento de reuniões.</td></tr>
              <tr><td>Adicionar material comercial</td><td>Gestores ou usuário com função Materiais pré-reunião ou Materiais de negociação.</td></tr>
              <tr><td>Criar modelo comercial ou nova cadência</td><td>Gestores.</td></tr>
              <tr><td>Qualidade da base e Importar</td><td>Supervisores e administradores.</td></tr>
              <tr><td>Administrar acessos e funções da equipe</td><td>Administradores. Supervisores consultam a equipe em modo de leitura.</td></tr>
            </tbody>
          </table></div>
          <Callout title="Importante">
            <p>O botão <b>Nova ação</b> não transforma a ficha em propriedade de uma pessoa. O menu é montado conforme as funções comerciais: quem tem Prospecção pode colaborar com interações, pessoas de contato, tarefas e oportunidades; reuniões e materiais seguem suas funções específicas. Os campos centrais da conta continuam sob responsabilidade do responsável atual ou da gestão.</p>
          </Callout>
        </Section>

        <Section id="visao-geral" title="Visão geral">
          <p>A <Link className="text-link" href="/app">Visão geral</Link> é o painel de entrada. Ela resume o que está acontecendo sem substituir as páginas operacionais.</p>
          <ul>
            <li><b>Editoras / Responsabilidade atual:</b> gestores veem a base ativa; usuários comuns acompanham as contas cuja condução está atualmente com eles.</li>
            <li><b>Já contatadas:</b> ajuda a acompanhar a cobertura das contas sob responsabilidade atual ou da operação.</li>
            <li><b>Tarefas e próximos passos:</b> mostra pendências próximas que merecem atenção.</li>
            <li><b>Maiores Radar Scores:</b> destaca contas de maior pontuação, mas a ordem real de execução continua em Prioridades.</li>
            <li><b>Pipeline:</b> oferece uma visão resumida da distribuição atual por etapa.</li>
            <li><b>Atividade:</b> apresenta movimentações recentes suas ou da equipe, conforme o nível de acesso.</li>
          </ul>
          <p>Use a Visão geral para se situar. Para decidir <b>o que fazer agora</b>, vá para Prioridades e Minha fila.</p>
        </Section>

        <Section id="prioridades" title="Prioridades e Radar Score">
          <p>A página <Link className="text-link" href="/app/prioridades">Prioridades</Link> é uma fila de decisão. Ela combina Radar Score com urgência operacional, último resultado, próxima ação, tarefas e prioridade manual.</p>
          <h3>Como a fila deve ser interpretada</h3>
          <ul>
            <li>Tarefas atrasadas e próximas ações vencidas recebem atenção antes de contas apenas “promissoras”.</li>
            <li>Pedidos de proposta, follow-ups, oportunidades qualificadas e contas sem responsável atual podem ganhar destaque conforme o contexto.</li>
            <li>A prioridade manual altera o peso da conta, mas não deve ser usada para esconder um prazo vencido.</li>
            <li>O botão <b>Assumir</b> aparece em contas disponíveis sem responsável atual.</li>
          </ul>
          <p>A tela mostra inicialmente as contas de maior prioridade. É possível carregar mais em blocos de 30, até o limite operacional de 200 itens nessa visão.</p>
          <h3>Radar Score</h3>
          <p>O modelo atual usa <b>70% de aderência editorial + 20% de potencial comercial + 10% de prospectabilidade</b>. A tela de explicação mostra Score atual, melhor oportunidade, aderência, potencial, qualidade dos dados, fits por produto e fatores que contribuíram positiva ou negativamente.</p>
          <p>O Radar Score é baseado em regras explícitas do CRM. Ele não substitui o julgamento comercial da equipe e não significa, sozinho, que uma editora deve ser abordada imediatamente.</p>
        </Section>

        <Section id="editoras" title="Base de editoras: busca, filtros e visões salvas">
          <p>A página <Link className="text-link" href="/app/editoras">Editoras</Link> é a base central para localizar contas.</p>
          <h3>Busca e filtros</h3>
          <ul>
            <li>A busca principal localiza por <b>nome, nome fantasia ou CNPJ</b>.</li>
            <li>Os filtros rápidos incluem etapa e prioridade.</li>
            <li><b>Mais filtros</b> permite refinar por informações como UF, perfil editorial e responsável, além de outros critérios cadastrados na base.</li>
            <li>Se a combinação não retornar registros, use <b>Limpar filtros</b> para voltar à base ampla.</li>
          </ul>
          <h3>Visões salvas</h3>
          <p>Uma visão salva guarda a combinação atual de busca e filtros para reutilização. Ela é pessoal: salvar uma visão não altera a tela dos demais usuários. A página atual da paginação não é preservada.</p>
          <p>Use nomes objetivos, como <b>Infantil · SP</b>, <b>Sem contato · score 80+</b> ou <b>Sob minha responsabilidade · Alta</b>.</p>
          <h3>Assumir responsabilidade atual</h3>
          <p>Quando uma conta está sem responsável atual, alguém da prospecção pode assumir a condução do estágio. Na primeira atribuição, essa pessoa também passa a ser registrada como <b>Prospector de origem</b>. Em handoffs posteriores, o responsável atual pode mudar, mas o prospector de origem permanece preservado.</p>
          <p>O CRM protege a operação contra duas pessoas assumirem a mesma conta ao mesmo tempo: se outra pessoa concluir a ação primeiro, a lista é atualizada e a responsabilidade não é duplicada.</p>
          <p>Todos os usuários ativos podem criar uma editora pelo botão <b>Nova editora</b> ou pelo acesso <b>Gestão → Nova editora</b>. O cadastro manual usa CNPJ como chave de negócio e bloqueia a criação de uma segunda editora com o mesmo CNPJ.</p>
        </Section>

        <Section id="nova-editora" title="Nova editora: cadastro manual completo">
          <p>A página <Link className="text-link" href="/app/editoras/nova">Nova editora</Link> fica em <b>Gestão</b> e pode ser usada por todos os usuários ativos do CRM. Ela deve ser usada quando uma editora precisa entrar individualmente na base.</p>
          <h3>Identificação obrigatória</h3>
          <p>O cadastro só pode ser concluído quando os cinco campos abaixo estiverem preenchidos:</p>
          <ul>
            <li><b>Nome principal no CRM;</b></li>
            <li><b>Nome comercial / marca;</b></li>
            <li><b>Nome fantasia oficial;</b></li>
            <li><b>Razão social;</b></li>
            <li><b>CNPJ.</b></li>
          </ul>
          <p>O CNPJ é conferido antes de salvar. Se já existir na base, o CRM bloqueia o novo cadastro e direciona para o registro existente. Se o CNPJ estiver associado a uma editora arquivada, o aviso também é específico.</p>
          <h3>Perfil editorial</h3>
          <p>Marque quantos perfis forem necessários. Se uma categoria ainda não existir, use <b>Criar novo perfil editorial</b>. O sistema evita duplicações simples causadas por diferenças de maiúsculas, acentos ou espaços.</p>
          <h3>Pessoas vinculadas</h3>
          <p>Use <b>Sócios e responsáveis legais</b> para pessoas com vínculo societário ou representação legal e <b>Outras pessoas de contato</b> para direção editorial, comercial, marketing, financeiro, atendimento e outras funções.</p>
          <p>As pessoas são cadastradas individualmente. Depois de adicionadas, aparecem como cartões compactos e podem ser editadas. A remoção exige confirmação, reduzindo o risco de exclusão acidental.</p>
          <Callout title="O que o CRM calcula sozinho">
            <p>Radar Score, aderências, qualidade dos dados, histórico, último contato, auditoria e demais indicadores derivados não devem ser preenchidos manualmente. Eles são calculados a partir dos dados e da atividade real da conta.</p>
          </Callout>
        </Section>

        <Section id="ficha" title="Ficha da editora">
          <p>A ficha reúne o contexto completo da conta. A ordem atual foi pensada para leitura comercial rápida:</p>
          <p><b>Visão da conta → Contato rápido → Dados da editora → Radar Score detalhado → Pessoas de contato → Histórico de interações → Oportunidades → Reuniões → Materiais comerciais.</b></p>
          <h3>Visão da conta</h3>
          <p>Resume <b>Responsável atual</b>, <b>Prospector de origem</b>, próxima ação, última interação, oportunidade ativa, próxima reunião, etapa e prioridade. É o bloco para responder rapidamente quem originou a relação e quem está com a condução agora.</p>
          <h3>Contato rápido</h3>
          <p>Mostra telefone, e-mail geral, site e localização principal. É um atalho para os dados de contato mais usados.</p>
          <h3>Dados da editora e perfil editorial</h3>
          <p>Concentram razão social, CNPJ, localização, porte, segmentos de atuação e classificação editorial. Perfil editorial e segmentos de atuação são conceitos diferentes: o primeiro descreve <b>o que publica</b>; o segundo, <b>em quais mercados atua</b>.</p>
          <h3>Radar Score detalhado</h3>
          <p>O painel é expansível. Use-o quando precisar entender por que a conta recebeu determinada pontuação ou qual produto da Radar aparece com melhor aderência.</p>
          <h3>Acompanhamento</h3>
          <p>Gestores ou o <b>Responsável atual</b> podem atualizar etapa, prioridade, responsável atual, próxima ação principal e notas estruturantes. Isso não impede a colaboração: outros usuários com função Prospecção podem registrar ações na mesma ficha conforme o trabalho que realmente realizaram.</p>
          <Callout title="Notas não são histórico">
            <p>Use <b>Notas</b> para contexto duradouro: restrições, preferências, informações relevantes para futuras abordagens. Conversas e tentativas de contato devem ser registradas como <b>Interações</b>.</p>
          </Callout>
          <h3>Nova ação e trabalho colaborativo</h3>
          <p>O botão <b>Nova ação</b> concentra as ações de criação da ficha. A editora pertence à operação da Radar, não ao usuário que iniciou o contato. Dependendo das funções comerciais, diferentes pessoas podem registrar o próprio trabalho na mesma conta. O menu pode exibir:</p>
          <ul>
            <li>Registrar interação;</li>
            <li>Criar tarefa;</li>
            <li>Criar oportunidade;</li>
            <li>Adicionar pessoa de contato;</li>
            <li>Agendar reunião;</li>
            <li>Adicionar material.</li>
          </ul>
        </Section>

        <Section id="relacionamento" title="Pessoas de contato e histórico de interações">
          <h3>Pessoas de contato</h3>
          <p>Cadastre pessoas reais vinculadas à editora. Informe nome e, quando disponíveis, cargo, área, e-mail e celular. Marque <b>É decisor(a)</b> quando a pessoa participa ou influencia a decisão de contratação.</p>
          <h3>Registrar interação</h3>
          <p>Use <b>Nova ação → Registrar interação</b> depois de uma tentativa ou conversa relevante. O registro deve permitir que outra pessoa entenda o que aconteceu sem precisar perguntar ao autor.</p>
          <ul>
            <li><b>Canal:</b> ligação, e-mail, WhatsApp, LinkedIn, reunião ou outro.</li>
            <li><b>Resultado:</b> escolha o resultado que melhor representa o contato.</li>
            <li><b>Resumo:</b> registre fatos e informações descobertas, não apenas “falamos”.</li>
            <li><b>Interesse:</b> use quando houver sinal suficiente para estimar o interesse percebido.</li>
            <li><b>Próximo passo:</b> descreva o que ficou combinado.</li>
            <li><b>Próxima ação:</b> informe data e horário quando existir um retorno com prazo.</li>
          </ul>
          <p>Datas são exibidas e digitadas no padrão brasileiro <b>dd/mm/aaaa</b>, com horário separado quando necessário.</p>
          <Callout title="Exemplo de bom registro">
            <p>Em vez de “Contato realizado”, prefira algo como: <b>“Coordenadora recebeu a apresentação, pediu seleção de títulos infantis e combinou retorno na próxima terça-feira.”</b></p>
          </Callout>
        </Section>

        <Section id="oportunidades" title="Oportunidades">
          <p>Crie uma oportunidade quando a conversa já representar uma possibilidade concreta de contratação, proposta, inscrição ou acompanhamento comercial.</p>
          <h3>Serviços da Radar</h3>
          <ul>
            <li><b>Radar de Oportunidades:</b> serviço de divulgação de livros. Registre a quantidade de títulos que a editora pretende divulgar.</li>
            <li><b>PNLD:</b> serviço de inscrição e acompanhamento de obras em edital. Registre edital/programa, categoria ou objeto e quantidade de obras quando essas informações já estiverem definidas.</li>
            <li><b>Radar de Licitações:</b> serviço de acompanhamento de editais/licitações. Registre o escopo do acompanhamento; não use quantidade de livros, porque esse serviço não é uma divulgação de títulos.</li>
            <li><b>Outro serviço / projeto:</b> use apenas quando a oportunidade não se encaixar nas três linhas acima.</li>
          </ul>
          <p>Toda oportunidade também registra título, etapa, previsão de conclusão, próximo passo, descrição do contexto e motivo da perda quando aplicável.</p>
          <Callout title="Valores comerciais não entram no CRM" tone="warning">
            <p>Preços, valores de pacotes e probabilidades de fechamento são informações sensíveis e não são armazenados nas oportunidades, relatórios ou exportações do CRM.</p>
          </Callout>
          <Callout title="Oportunidade não é sinônimo de contato">
            <p>Uma conversa cordial, pedido de material ou primeiro contato não precisa virar oportunidade imediatamente. Registre oportunidade quando existir um negócio identificável.</p>
          </Callout>
        </Section>

        <Section id="pipeline" title="Pipeline">
          <p>O <Link className="text-link" href="/app/pipeline">Pipeline</Link> representa a etapa comercial atual das editoras. Usuários comuns veem as editoras sob sua responsabilidade atual; gestores acompanham a distribuição consolidada.</p>
          <h3>Filtros</h3>
          <ul>
            <li>busca por editora ou CNPJ;</li>
            <li>responsável atual, para gestores;</li>
            <li>prioridade;</li>
            <li>Radar Score mínimo.</li>
          </ul>
          <p>Enquanto as contagens estão sendo atualizadas, o CRM mostra <b>—</b> em vez de exibir temporariamente um zero incorreto.</p>
          <h3>Mover uma editora</h3>
          <p>Use o seletor <b>Mover para</b> no cartão. Movimentações normais são salvas imediatamente e exibem uma confirmação com a opção <b>Desfazer</b>.</p>
          <p>Quando a etapa de destino representa perda/encerramento, como <b>Sem interesse</b>, o CRM pede confirmação antes de gravar.</p>
          <Callout title="Pipeline e oportunidade são diferentes">
            <p>O Pipeline descreve a situação geral da conta. A oportunidade descreve um negócio específico. Uma editora pode continuar em relacionamento com a Radar mesmo depois de uma oportunidade específica ser encerrada.</p>
          </Callout>
        </Section>

        <Section id="tarefas" title="Minha fila: tarefas, follow-ups e lembretes">
          <p><Link className="text-link" href="/app/tarefas">Minha fila</Link> é a área de execução. Ela reúne tarefas manuais, follow-ups, tarefas de cadência e automações de reuniões.</p>
          <h3>Atenção agora</h3>
          <p>Lembretes não revisados aparecem no topo. É possível abrir o item, marcar individualmente como lido ou usar <b>Marcar todos como lidos</b>.</p>
          <h3>Busca e escopo</h3>
          <ul>
            <li>A busca percorre a fila por tarefa, editora e pessoa.</li>
            <li>É possível alternar entre Em aberto, Concluídas e Todas.</li>
            <li>Gestores podem alternar entre <b>Minhas</b> e <b>Equipe</b>.</li>
            <li>A lista é paginada para não tentar carregar toda a base de tarefas de uma vez.</li>
          </ul>
          <h3>Concluir tarefas</h3>
          <p>Tarefas comuns podem ser concluídas diretamente. Tarefas criadas por uma cadência pedem um <b>resultado comercial</b>, porque esse resultado determina se a sequência continua, é pausada ou é encerrada.</p>
          <p>Quando houver modelo comercial associado à tarefa, o CRM mostra o texto sugerido e permite copiá-lo.</p>
        </Section>


        <Section id="notificacoes" title="Notificações e menções">
          <p>A página <Link className="text-link" href="/app/notificacoes">Notificações</Link> é a caixa de entrada do trabalho compartilhado. O contador na navegação mostra quantos avisos ainda não foram lidos.</p>
          <h3>O que gera notificação</h3>
          <ul>
            <li>uma <b>@menção</b> em notas da editora, resumo de interação, resultado ou próximo passo de reunião;</li>
            <li>uma editora transferida para sua <b>responsabilidade atual</b>;</li>
            <li>uma reunião em que você foi definido como apresentador;</li>
            <li>reagendamento ou cancelamento de reunião relevante para você;</li>
            <li>uma tarefa ou follow-up atribuído a você;</li>
            <li>um material comercial atribuído à sua responsabilidade;</li>
            <li>lembretes de tarefas e próximas ações que já existiam no CRM.</li>
          </ul>
          <h3>Como mencionar alguém</h3>
          <p>Nos campos compatíveis, digite <b>@</b> e escolha uma pessoa da lista. O nome fica no texto e o CRM cria uma notificação vinculada ao usuário correto. Apenas escrever um nome sem selecioná-lo na lista não cria uma menção estruturada.</p>
          <h3>Leitura e navegação</h3>
          <p>É possível alternar entre <b>Não lidas</b> e <b>Todas</b>, abrir a notificação para ir diretamente ao registro relacionado e marcar todos os avisos como lidos. A lista é paginada em blocos de 30.</p>
          <Callout title="Notificação não é Atividade">
            <p><b>Notificações</b> mostram o que alguém precisa saber ou fazer. <b>Atividade</b> continua sendo o histórico auditável do que mudou no CRM.</p>
          </Callout>
          <p>O envio por e-mail ainda não faz parte desta versão. A central dentro do CRM é a fonte oficial de notificações neste momento.</p>
        </Section>

        <Section id="cadencias" title="Cadências de prospecção">
          <p><Link className="text-link" href="/app/cadencias">Cadências</Link> automatizam a criação de uma sequência de tarefas, não o contato em si. A pessoa continua responsável por executar cada abordagem.</p>
          <h3>Iniciar uma cadência</h3>
          <ol>
            <li>Busque a editora.</li>
            <li>Escolha a cadência adequada.</li>
            <li>Gestores podem escolher o responsável; prospectadores iniciam para si mesmos.</li>
            <li>Clique em <b>Iniciar cadência</b>. As tarefas são colocadas na fila conforme os dias definidos.</li>
          </ol>
          <p>Prospectadores podem iniciar cadências em contas próprias e, quando permitido pelo fluxo, assumir uma conta sem responsável. Não podem iniciar a sequência sobre conta pertencente a outra pessoa.</p>
          <h3>Resultados de uma tarefa de cadência</h3>
          <p>Resultados como sem resposta, pediu e-mail, retorno agendado, reunião marcada, sem interesse ou oportunidade qualificada podem alterar próximas tarefas, pausar a sequência, encerrar etapas futuras ou ajustar a etapa comercial.</p>
          <h3>Criar uma nova cadência</h3>
          <p>Gestores podem criar modelos de cadência, definindo nome, descrição, dia relativo, tipo de tarefa e título de cada etapa.</p>
        </Section>

        <Section id="modelos" title="Modelos e roteiros comerciais">
          <p>A página <Link className="text-link" href="/app/modelos">Modelos</Link> funciona como biblioteca de mensagens e roteiros da Radar.</p>
          <ul>
            <li>Todos os usuários podem consultar e copiar os modelos ativos.</li>
            <li>Gestores podem criar novos modelos.</li>
            <li>Cada modelo registra canal, finalidade e texto.</li>
          </ul>
          <p>Antes de enviar, substitua campos entre colchetes, como <code>[NOME]</code>, <code>[EDITORA]</code>, <code>[OPORTUNIDADE/REDE]</code> e <code>[EDITAL/PROGRAMA]</code>. O modelo é ponto de partida, não mensagem para copiar sem contextualização.</p>
          <p>Depois do envio, registre a interação na ficha da editora e defina o próximo passo.</p>
        </Section>

        <Section id="agenda" title="Agenda comercial">
          <p>A <Link className="text-link" href="/app/agenda">Agenda</Link> centraliza reuniões e disponibilidade da equipe.</p>
          <h3>Modos de visualização</h3>
          <ul>
            <li><b>Dia:</b> visão horária de um dia.</li>
            <li><b>Semana:</b> visão horária com opção de 5 ou 7 dias.</li>
            <li><b>Mês:</b> visão mensal para localização rápida de compromissos.</li>
          </ul>
          <p>Também é possível filtrar por apresentador, status da reunião e buscar por reunião, editora ou participante. As preferências principais de visualização são mantidas no navegador.</p>
          <h3>Criar uma reunião pela Agenda</h3>
          <p>Gestores e usuários com função <b>Agendamento de reuniões</b> podem clicar em um horário disponível ou usar o botão <b>Reunião</b>. O fluxo rápido pede editora, apresentador, duração, data e horário e continua para a ficha da editora para completar os dados.</p>
          <h3>Disponibilidade</h3>
          <p>O CRM considera regras configuradas para o apresentador — dias ativos, jornada, intervalo, respiro entre reuniões e antecedência mínima — e também conflitos internos. Quando o Google Agenda está conectado, os bloqueios externos entram na consulta.</p>
          <p>Compromissos externos aparecem apenas como <b>Indisponível</b>. Título e conteúdo de compromissos pessoais não são exibidos na Agenda do CRM.</p>
        </Section>

        <Section id="reunioes" title="Reuniões, sincronização e pós-reunião">
          <p>Reuniões são vinculadas à ficha da editora. O agendamento completo pode incluir título, tipo, apresentador, horário, duração, participantes, materiais e observações.</p>
          <h3>Participantes</h3>
          <p>É possível selecionar pessoas já cadastradas na editora ou incluir participantes manualmente. E-mails válidos podem ser usados pela sincronização com a agenda externa.</p>
          <h3>Google Agenda</h3>
          <p>Se a agenda do apresentador estiver conectada, o CRM tenta <b>criar ou atualizar o evento no Google Agenda</b> depois de salvar a reunião. Se a sincronização falhar ou a agenda não estiver conectada, a reunião continua salva no CRM e uma mensagem informa a situação.</p>
          <p>Ao cancelar uma reunião que já possui evento sincronizado, o CRM também tenta remover o compromisso correspondente do Google Agenda.</p>
          <h3>Pós-reunião e handoff</h3>
          <p>Depois da apresentação, registre o resultado, interesse percebido, próximo passo e eventual follow-up. O formulário também permite definir o <b>Responsável pelo próximo estágio</b>. Por padrão, o apresentador é sugerido, mas é possível manter a responsabilidade atual ou escolher outra pessoa ativa da equipe.</p>
          <p>Quando o responsável atual muda, o <b>Prospector de origem não muda</b>. O histórico continua mostrando quem fez os primeiros contatos. Oportunidades abertas acompanham o novo responsável atual; tarefas já atribuídas continuam com seus responsáveis específicos.</p>
          <p>Quando existe retorno programado, o CRM cria o follow-up para a pessoa selecionada. Também é possível marcar não comparecimento ou cancelamento, sempre registrando o status real da reunião.</p>
        </Section>

        <Section id="materiais" title="Materiais comerciais">
          <p>O bloco <b>Materiais comerciais</b> da ficha guarda referências aos arquivos usados no relacionamento com a editora.</p>
          <p>O CRM não duplica o arquivo: registra o <b>link</b> para Drive, Canva, Gamma, Notion ou outra plataforma, além de título, tipo, status, responsável, observação e reunião relacionada.</p>
          <p>Entre os tipos estão apresentação, material pré-reunião, projeto de negociação, proposta, curadoria e outros.</p>
          <p>Usuários com função <b>Materiais pré-reunião</b> ou <b>Materiais de negociação</b>, além de gestores, podem adicionar e editar materiais. Outros perfis podem consultá-los quando tiverem acesso à ficha.</p>
          <p>Reuniões futuras indicam se já existe material pronto relacionado ao atendimento.</p>
        </Section>

        <Section id="desempenho" title="Desempenho, metas e pipeline de oportunidades">
          <p>A página <Link className="text-link" href="/app/desempenho">Desempenho</Link> acompanha resultados individuais e, para gestores, consolida a equipe.</p>
          <ul>
            <li><b>Responsabilidade atual:</b> quantas editoras a pessoa conduz neste momento;</li>
            <li><b>Contas originadas:</b> quantas editoras tiveram a prospecção iniciada por ela, mesmo que depois tenham sido transferidas;</li>
            <li>interações no período;</li>
            <li>editoras diferentes contatadas;</li>
            <li>tarefas concluídas e atrasadas;</li>
            <li>oportunidades criadas e ganhas;</li>
            <li>oportunidades abertas por etapa e por serviço.</li>
          </ul>
          <p>O período pode ser alternado entre 30, 60 e 90 dias.</p>
          <h3>Metas</h3>
          <p>Gestores podem definir metas por pessoa e período para interações, tarefas concluídas e oportunidades criadas. O progresso é calculado a partir dos registros reais do CRM.</p>
          <h3>Pipeline de oportunidades</h3>
          <p>Em vez de forecast financeiro, o CRM acompanha quantidade de oportunidades abertas, propostas enviadas, negociações, ganhos no período e distribuição por serviço. Para Radar de Oportunidades também pode totalizar títulos em divulgação; para PNLD, obras em processo.</p>
        </Section>

        <Section id="relatorios" title="Relatórios, análises e exportação em Excel">
          <p><Link className="text-link" href="/app/relatorios">Relatórios</Link> é a área analítica mais completa. O escopo respeita o perfil: prospectadores recebem leitura pessoal; gestores recebem visão consolidada.</p>
          <p>Escolha 30, 60 ou 90 dias para comparar atividade e resultados.</p>
          <h3>Abas disponíveis</h3>
          <ul>
            <li><b>Visão geral:</b> pontos de atenção, ritmo comercial, funil, reuniões, cobertura e pipeline de oportunidades.</li>
            <li><b>Funil e oportunidades:</b> conversão, tempo médio por etapa, oportunidades por estágio e distribuição por serviço.</li>
            <li><b>Cadências e reuniões:</b> desempenho das sequências, canais e resultados de reuniões.</li>
            <li><b>Equipe:</b> disponível para gestores, separando contas originadas, responsabilidade atual e produtividade por pessoa.</li>
            <li><b>Inteligência Radar:</b> distribuição de score, aderência por produto e leituras da base.</li>
          </ul>
          <h3>Baixar relatório</h3>
          <p>O CRM gera arquivos <b>.xlsx</b> com conjuntos diferentes de abas. As opções incluem Completo, Executivo, Comercial, Pipeline e oportunidades, Cadências e abordagens, Reuniões e Base de editoras; gestores também podem exportar Equipe e produtividade.</p>
          <p>A exportação respeita o escopo de acesso. Um prospectador não recebe uma exportação de equipe apenas por escolher outro tipo de relatório. As planilhas de oportunidades não incluem preços, valores de pacote ou probabilidade de fechamento.</p>
        </Section>

        <Section id="atividade" title="Atividade">
          <p>A página <Link className="text-link" href="/app/atividade">Atividade</Link> é o histórico resumido de mudanças relevantes.</p>
          <p>O feed traduz registros internos para linguagem de uso e mostra <b>todos os campos relevantes alterados no mesmo evento</b>, com valor anterior e novo. Ex.: etapa, prioridade, responsável e próxima ação podem aparecer juntas quando foram modificadas na mesma edição.</p>
          <ul>
            <li>Prospectadores revisam suas próprias movimentações.</li>
            <li>Gestores acompanham as principais movimentações da equipe.</li>
            <li>A busca percorre o histórico completo dentro do escopo permitido do usuário.</li>
            <li>O histórico é paginado em blocos de 30 registros para manter a tela leve mesmo quando a auditoria crescer.</li>
          </ul>
          <p>Atividade é útil para auditoria e contexto, mas não substitui o Histórico de interações da ficha quando você precisa entender uma conversa comercial.</p>
        </Section>

        <Section id="qualidade" title="Qualidade da base">
          <p><Link className="text-link" href="/app/qualidade">Qualidade da base</Link> é uma área de supervisão e administração para identificar cadastros que merecem revisão.</p>
          <p>A análise mostra contagens como:</p>
          <ul>
            <li>sem e-mail;</li>
            <li>sem telefone;</li>
            <li>sem site;</li>
            <li>sem CNPJ;</li>
            <li>sem decisor;</li>
            <li>sem responsável;</li>
            <li>nunca contatadas;</li>
            <li>grupos de possíveis duplicidades.</li>
          </ul>
          <p><b>Contas para enriquecer</b> prioriza editoras com mais informações importantes faltando. <b>Possíveis duplicidades</b> agrupa registros que podem representar a mesma editora.</p>
          <Callout title="A tela não faz fusão automática" tone="warning">
            <p>Duplicidade é um sinal para revisão humana. Abra os registros, compare os dados e só tome uma decisão depois de confirmar que representam a mesma empresa.</p>
          </Callout>
          <p>Ao clicar em <b>Recalcular</b>, os últimos resultados continuam visíveis enquanto a nova análise é processada.</p>
        </Section>

        <Section id="importar" title="Importar editoras com segurança">
          <p>A página <Link className="text-link" href="/app/importar">Importar</Link> é exclusiva de supervisores e administradores e usa um arquivo <b>Excel .xlsx</b> padronizado. O objetivo é fazer em massa o mesmo cadastro estruturado disponível em <b>Nova editora</b>.</p>
          <h3>O arquivo padrão</h3>
          <p>Baixe sempre o modelo diretamente da página Importar. Ele possui três abas:</p>
          <ul>
            <li><b>LEIA-ME:</b> traz as instruções, formatos aceitos, etapas atuais do pipeline e e-mails ativos da equipe. Essa aba não é importada.</li>
            <li><b>Editoras:</b> uma linha por editora, com as mesmas informações usadas no cadastro manual.</li>
            <li><b>Pessoas:</b> uma linha por pessoa vinculada. O CNPJ da editora faz a ligação entre as duas abas.</li>
          </ul>
          <Callout title="Não renomeie as abas de dados" tone="warning">
            <p>As abas <b>Editoras</b> e <b>Pessoas</b> precisam manter esses nomes para o CRM reconhecer o arquivo.</p>
          </Callout>
          <h3>Aba Editoras</h3>
          <p>Os cinco campos obrigatórios são <b>Nome principal no CRM, Nome comercial / marca, Nome fantasia oficial, Razão social e CNPJ</b>. O CNPJ precisa ter 14 dígitos e é a chave usada para localizar o cadastro.</p>
          <p>Os demais campos seguem a página Nova editora: dados empresariais, endereço, canais institucionais, perfil editorial e acompanhamento comercial.</p>
          <p>Para informar mais de um <b>Perfil editorial</b>, separe os valores com <b>|</b>. Exemplo: <code>Infantil | Literatura | Paradidático</code>. Perfis ainda inexistentes também podem entrar pela importação e passam a integrar as opções do CRM.</p>
          <p>Em <b>Responsável atual (e-mail)</b>, use o e-mail de uma pessoa ativa na equipe. Em <b>Etapa do pipeline</b>, use exatamente o nome de uma etapa ativa.</p>
          <h3>Aba Pessoas</h3>
          <p>Repita o CNPJ da editora em cada linha. Assim uma editora pode ter quantas pessoas forem necessárias sem criar colunas como “Contato 1”, “Contato 2” e “Contato 3”.</p>
          <ul>
            <li><b>Tipo de vínculo:</b> use “Sócio / responsável legal” ou “Outro contato”.</li>
            <li><b>Sócio / responsável legal:</b> CNPJ, tipo de vínculo, nome e função/cargo são obrigatórios.</li>
            <li><b>Outro contato:</b> CNPJ, tipo de vínculo e nome são obrigatórios.</li>
            <li><b>É decisor?:</b> use Sim ou Não.</li>
            <li><b>Canal preferencial:</b> Telefone, E-mail, WhatsApp, LinkedIn ou Outro.</li>
          </ul>
          <h3>Como o CNPJ controla duplicidades</h3>
          <p>A importação não usa mais Nome + UF nem uma referência técnica como chave principal. <b>O CNPJ é a chave de negócio.</b> Se o CNPJ já existir, o CRM entende que se trata da mesma editora.</p>
          <h3>Ignorar ou atualizar</h3>
          <ul>
            <li><b>Ignorar e preservar:</b> CNPJs já existentes não são alterados; pessoas já reconhecidas também são preservadas.</li>
            <li><b>Atualizar somente campos preenchidos:</b> os dados presentes no Excel atualizam o cadastro existente. Células vazias nunca apagam valores atuais.</li>
          </ul>
          <h3>Fluxo correto</h3>
          <ol>
            <li><b>Baixe o modelo Excel atualizado.</b></li>
            <li><b>Preencha Editoras e Pessoas.</b></li>
            <li><b>Selecione o arquivo .xlsx.</b></li>
            <li><b>Confira a amostra e os erros locais.</b></li>
            <li><b>Escolha Ignorar ou Atualizar.</b></li>
            <li><b>Clique em Validar planilha.</b> Nenhum dado é salvo nessa etapa.</li>
            <li><b>Corrija os erros.</b> Se necessário, baixe a lista de inconsistências.</li>
            <li><b>Confirme a importação.</b> O botão de importação só é liberado após uma validação sem erros.</li>
          </ol>
          <p><b>Radar Score, fits, qualidade dos dados, histórico, auditoria e outros indicadores calculados não fazem parte do Excel.</b> O CRM recalcula esses elementos automaticamente quando os dados relevantes mudam.</p>
        </Section>

        <Section id="equipe" title="Equipe, acessos, funções e disponibilidade">
          <p>A página <Link className="text-link" href="/app/equipe">Equipe</Link> é visível para supervisores e administradores. A lista é compacta: abra <b>Gerenciar</b> ou <b>Ver detalhes</b> somente na pessoa que precisa consultar.</p>
          <h3>Para administradores</h3>
          <p>É possível editar nome de exibição, cargo, nível de acesso, status e funções comerciais. O CRM não permite salvar um usuário sem nome de exibição.</p>
          <p>Administradores também liberam novos cadastros que estejam aguardando aprovação.</p>
          <h3>Para supervisores</h3>
          <p>A página fica em modo de consulta. O supervisor acompanha perfis, funções e disponibilidade, mas não administra o acesso da equipe.</p>
          <h3>Regras de agenda do apresentador</h3>
          <p>Para quem possui função <b>Apresentação comercial</b>, podem ser configurados:</p>
          <ul>
            <li>dias ativos;</li>
            <li>início e fim do expediente;</li>
            <li>intervalo;</li>
            <li>respiro entre reuniões;</li>
            <li>antecedência mínima;</li>
            <li>duração padrão.</li>
          </ul>
          <p>Contas sem nome cadastrado aparecem com o aviso <b>Nome pendente</b>.</p>
        </Section>

        <Section id="perfil" title="Meu perfil e integração com Google Agenda">
          <p>Em <Link className="text-link" href="/app/perfil">Meu perfil</Link>, cada usuário pode atualizar foto, nome e cargo. E-mail e nível de acesso são exibidos para consulta.</p>
          <p>O nome completo é obrigatório ao salvar o perfil porque ele é usado em responsáveis, atividade, relatórios, reuniões e outras áreas do CRM.</p>
          <h3>Google Agenda</h3>
          <p>A seção de integração aparece para gestores e apresentadores. A configuração usa uma ponte por Apps Script administrada pela Radar.</p>
          <p>Quando conectada, a integração permite consultar blocos de indisponibilidade e sincronizar reuniões do CRM com a agenda do apresentador.</p>
          <p>O teste de disponibilidade mostra blocos ocupados dos próximos dias sem expor o conteúdo pessoal do compromisso.</p>
          <Callout title="Se a agenda não estiver conectada">
            <p>O CRM continua funcionando. Reuniões podem ser registradas internamente; apenas a consulta/sincronização externa fica indisponível até a configuração ser concluída.</p>
          </Callout>
        </Section>

        <Section id="boas-praticas" title="Boas práticas de uso">
          <ul>
            <li><b>Leia antes de abordar:</b> confira histórico, responsável, próxima ação e Radar Score antes de falar com a editora.</li>
            <li><b>Registre no mesmo dia:</b> quanto mais tempo passa, maior a chance de perder detalhes importantes.</li>
            <li><b>Seja factual:</b> registre o que a editora disse, pediu ou combinou; evite avaliações vagas.</li>
            <li><b>Defina próximo passo:</b> uma interação sem encaminhamento tende a virar conta parada.</li>
            <li><b>Não duplique informação:</b> conversa em Interações; ação futura em Tarefas; contexto permanente em Notas.</li>
            <li><b>Não mova o Pipeline para “parecer avançado”:</b> a etapa deve refletir a situação real.</li>
            <li><b>Não crie oportunidade cedo demais:</b> oportunidade deve representar negócio concreto.</li>
            <li><b>Use decisor com critério:</b> marque apenas quem realmente participa ou influencia a decisão.</li>
            <li><b>Preserve a base:</b> antes de criar nova editora ou importar, procure por nome e CNPJ para reduzir duplicidades.</li>
            <li><b>Use os modelos como base:</b> personalize a mensagem antes do envio.</li>
          </ul>
        </Section>

        <Section id="problemas" title="Problemas comuns e como resolver">
          <Trouble q="Apareceu “Acesso restrito” em uma página.">A página exige outro nível de acesso ou função comercial. Confira seu perfil e, se necessário, peça a um administrador para revisar suas permissões.</Trouble>
          <Trouble q="Não consigo editar uma editora.">Para prospectadores, a conta precisa estar sob sua responsabilidade. Se estiver sem responsável, use <b>Assumir editora</b>. Se pertencer a outra pessoa, a ficha permanece em leitura.</Trouble>
          <Trouble q="A editora que eu tentei assumir foi atribuída a outra pessoa.">Outra pessoa concluiu a ação antes. O CRM evita duas pessoas como responsáveis simultâneas e atualiza a tela.</Trouble>
          <Trouble q="Mudei a etapa errada no Pipeline.">Use <b>Desfazer</b> na confirmação exibida logo após a movimentação. Para etapas de perda, o CRM pede confirmação antes de salvar.</Trouble>
          <Trouble q="A reunião foi salva, mas não entrou no Google Agenda.">A reunião continua válida no CRM. Verifique se a agenda do apresentador está conectada e consulte a mensagem de sincronização exibida no bloco da reunião.</Trouble>
          <Trouble q="A importação está bloqueada.">Há erros na validação. Confira em qual aba e linha o problema ocorreu ou baixe a lista de inconsistências. Corrija o Excel e valide novamente. Aviso e erro não são a mesma coisa: erro bloqueia a importação.</Trouble>
          <Trouble q="Qualidade da base demora alguns segundos.">A análise percorre milhares de registros. Durante uma atualização, os resultados anteriores continuam visíveis. Evite clicar repetidamente em Recalcular.</Trouble>
          <Trouble q="Uma data está inválida.">Use o padrão <b>dd/mm/aaaa</b> e, quando houver horário, preencha também o campo de hora.</Trouble>
          <Trouble q="Um usuário aparece somente com e-mail.">O nome de exibição ainda não foi preenchido. Um administrador pode corrigir em Equipe, ou a própria pessoa pode atualizar Meu perfil.</Trouble>
        </Section>

        <Section id="faq" title="FAQ">
          <Faq q="Por onde começo meu dia?">Visão geral para se situar, Prioridades para decidir onde agir e Minha fila para executar tarefas e retornos.</Faq>
          <Faq q="Radar Score e prioridade são a mesma coisa?">Não. Radar Score interpreta aderência e potencial. Prioridade manual é um ajuste operacional. A fila de Prioridades ainda considera prazos, tarefas e último resultado.</Faq>
          <Faq q="O Radar Score usa IA para decidir quem abordar?">Não. A pontuação exibida atualmente é baseada em regras e fatores explicitados pelo CRM. A decisão comercial continua sendo humana.</Faq>
          <Faq q="Onde vejo por que uma editora recebeu determinado score?">Abra a ficha e expanda <b>Radar Score detalhado</b> ou use a explicação disponível em Prioridades.</Faq>
          <Faq q="Preciso criar uma oportunidade antes de toda reunião?">Não. Registre oportunidade quando houver negócio concreto. O CRM permite reunião sem oportunidade porque isso também acontece na operação real.</Faq>
          <Faq q="Qual a diferença entre pessoa de contato e interação?">Pessoa de contato é quem trabalha ou representa a editora. Interação é uma conversa, tentativa ou ação que aconteceu com a conta.</Faq>
          <Faq q="O botão Nova ação mostra tudo para todos?">Não. As opções dependem das funções comerciais. Usuários com Prospecção podem colaborar em interações, pessoas de contato, tarefas e oportunidades; reuniões e materiais seguem funções específicas.</Faq>
          <Faq q="Qual a diferença entre Prospector de origem e Responsável atual?">Prospector de origem é quem iniciou a prospecção e permanece como dado histórico. Responsável atual é quem conduz o próximo estágio da conta e pode mudar durante um handoff.</Faq>
          <Faq q="O Lucas perde o crédito quando a conta passa para outra pessoa?">Não. A transferência altera a responsabilidade atual, mas preserva o prospector de origem e a autoria de todas as interações registradas.</Faq>
          <Faq q="Como menciono alguém?">Digite @ em um campo compatível, escolha a pessoa na lista e salve. Ela recebe uma notificação na Central de Notificações.</Faq>
          <Faq q="Um compromisso pessoal do Google fica visível para a equipe?">Não. A consulta externa exibe somente o intervalo como indisponível.</Faq>
          <Faq q="Se o Google Agenda falhar, eu perco a reunião?">Não. O registro interno é preservado. A sincronização externa é uma etapa adicional.</Faq>
          <Faq q="Informei uma data de retorno depois da reunião. Preciso criar outra tarefa?">Quando o fluxo cria o follow-up automaticamente, não é necessário duplicar a tarefa. Confira Minha fila.</Faq>
          <Faq q="Onde estão os lembretes?">Em Minha fila, no bloco <b>Atenção agora</b>.</Faq>
          <Faq q="Onde ficam arquivos e apresentações?">Em Materiais comerciais são guardados os links e o contexto. O arquivo permanece no Drive, Canva, Gamma, Notion ou outra plataforma.</Faq>
          <Faq q="Quem pode importar editoras?">Supervisores e administradores.</Faq>
          <Faq q="Importar um Excel com célula vazia apaga o dado atual?">No modo de atualização, não. Campos vazios preservam os valores existentes.</Faq>
          <Faq q="Quem pode criar modelos e cadências?">Gestores. Os demais usuários podem usar modelos e iniciar cadências permitidas em seu escopo.</Faq>
        </Section>
      </div>
    </div>
  </div>
}

function Section({id,title,children}){return <section id={id} className="card manual-section"><h2>{title}</h2>{children}</section>}
function Callout({title,children,tone=''}){return <div className={'manual-callout '+tone}><strong>{title}</strong><div>{children}</div></div>}
function Definition({term,children}){return <div className="manual-definition"><strong>{term}</strong><p>{children}</p></div>}
function Trouble({q,children}){return <div className="manual-trouble"><strong>{q}</strong><p>{children}</p></div>}
function Faq({q,children}){return <div className="manual-faq"><strong>{q}</strong><p>{children}</p></div>}
