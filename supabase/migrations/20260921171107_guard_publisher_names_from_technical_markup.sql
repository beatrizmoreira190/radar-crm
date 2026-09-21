alter table public.publishers
  add constraint publishers_name_no_technical_markup_chk
  check (
    btrim(name) <> ''
    and name !~* '(charset[[:space:]]*=|content-type[[:space:]]*:|<[[:space:]]*!?doctype|<[[:space:]]*(html|head|meta|script)([[:space:]>]))'
  );
