-- ============================================================
-- ARGONAUT OS · Thema 7 · DSGVO-Center (Schritt 1/4)
--
-- Das Protokoll: wer hat wann welchen Datensatz angelegt, geaendert oder
-- geloescht. Bei einer Datenschutz-Pruefung ist das die erste Frage.
--
-- WAS BEWUSST NICHT PROTOKOLLIERT WIRD: die WERTE. Ein Protokoll, das
-- mitschreibt, welche Telefonnummer geaendert wurde, ist selbst eine
-- Personendatensammlung — und damit ein neues Datenschutzproblem statt der
-- Loesung. Festgehalten wird: wer, wann, welche Tabelle, welcher Datensatz,
-- welche Aktion, welche FELDNAMEN sich geaendert haben. Bei Loeschungen
-- zusaetzlich eine Kennung (Name/Nummer), damit spaeter nachvollziehbar ist,
-- WAS geloescht wurde — ohne den Inhalt aufzubewahren.
--
-- LEISTUNG: Getriggert wird auf INSERT/UPDATE/DELETE, aber ein UPDATE, das
-- nichts aendert, erzeugt keine Zeile. Der Trigger haengt zunaechst nur an
-- drei klar sensiblen Tabellen — weitere koennen jederzeit dazu, der
-- Aufruf steht unten als Vorlage.
--
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

create table if not exists public.audit_log (
  id             bigserial primary key,
  owner_user_id  uuid,
  akteur_id      uuid,                        -- wer es getan hat (auth.uid())
  tabelle        text not null,
  datensatz_id   uuid,
  aktion         text not null,               -- angelegt | geaendert | geloescht
  felder         text[],                      -- NUR die Feldnamen, nie die Werte
  kennung        text,                        -- z.B. "Muster GmbH" — nur bei Loeschung
  geschehen_am   timestamptz not null default now()
);
create index if not exists audit_log_owner_idx on public.audit_log (owner_user_id, geschehen_am desc);
create index if not exists audit_log_satz_idx on public.audit_log (tabelle, datensatz_id);

alter table public.audit_log enable row level security;

-- Lesen darf der Betrieb. SCHREIBEN darf niemand von aussen — die Zeilen
-- entstehen ausschliesslich durch den Trigger (SECURITY DEFINER).
-- Ein Protokoll, das der Protokollierte selbst aendern kann, ist keins.
drop policy if exists al_select_own on public.audit_log;
create policy al_select_own on public.audit_log for select to public using ((auth.uid() = owner_user_id));
drop policy if exists al_select_ma on public.audit_log;
create policy al_select_ma on public.audit_log for select to public using ((owner_user_id = mein_chef_id()));

-- ---------- Die Trigger-Funktion ----------
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_id uuid;
  v_felder text[];
  v_kennung text;
  v_aktion text;
begin
  if (tg_op = 'DELETE') then
    v_aktion := 'geloescht';
    begin v_owner := (to_jsonb(old) ->> 'owner_user_id')::uuid; exception when others then v_owner := null; end;
    begin v_id := (to_jsonb(old) ->> 'id')::uuid; exception when others then v_id := null; end;
    -- Eine Kennung zur Nachvollziehbarkeit — der erste Treffer gewinnt.
    v_kennung := coalesce(
      to_jsonb(old) ->> 'name',
      to_jsonb(old) ->> 'titel',
      to_jsonb(old) ->> 'bezeichnung',
      to_jsonb(old) ->> 'rechnungsnummer',
      nullif(trim(coalesce(to_jsonb(old) ->> 'vorname', '') || ' ' || coalesce(to_jsonb(old) ->> 'nachname', '')), ''),
      to_jsonb(old) ->> 'firma'
    );

  elsif (tg_op = 'UPDATE') then
    -- Welche Felder haben sich geaendert? Nur die NAMEN, nie die Werte.
    select array_agg(schluessel order by schluessel) into v_felder
    from (
      select key as schluessel
      from jsonb_each(to_jsonb(new))
      where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key
        and key not in ('aktualisiert_am', 'updated_at', 'zuletzt_am')
    ) as geaendert;

    -- Ein Update ohne echte Aenderung erzeugt keine Zeile.
    if v_felder is null or array_length(v_felder, 1) is null then
      return new;
    end if;

    v_aktion := 'geaendert';
    begin v_owner := (to_jsonb(new) ->> 'owner_user_id')::uuid; exception when others then v_owner := null; end;
    begin v_id := (to_jsonb(new) ->> 'id')::uuid; exception when others then v_id := null; end;

  else
    v_aktion := 'angelegt';
    begin v_owner := (to_jsonb(new) ->> 'owner_user_id')::uuid; exception when others then v_owner := null; end;
    begin v_id := (to_jsonb(new) ->> 'id')::uuid; exception when others then v_id := null; end;
  end if;

  insert into public.audit_log (owner_user_id, akteur_id, tabelle, datensatz_id, aktion, felder, kennung)
  values (v_owner, auth.uid(), tg_table_name, v_id, v_aktion, v_felder, v_kennung);

  if (tg_op = 'DELETE') then return old; else return new; end if;
exception when others then
  -- Ein Protokollfehler darf NIE den eigentlichen Vorgang verhindern.
  -- Lieber eine fehlende Protokollzeile als eine Rechnung, die nicht speichert.
  if (tg_op = 'DELETE') then return old; else return new; end if;
end;
$$;

-- ---------- Trigger setzen ----------
-- Zunaechst drei klar sensible Tabellen. Weitere jederzeit nach demselben
-- Muster ergaenzen — einfach den Tabellennamen austauschen.

drop trigger if exists trg_audit_kontakte on public.kontakte;
create trigger trg_audit_kontakte
  after insert or update or delete on public.kontakte
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_rechnungen on public.rechnungen;
create trigger trg_audit_rechnungen
  after insert or update or delete on public.rechnungen
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_mitarbeiter on public.mitarbeiter;
create trigger trg_audit_mitarbeiter
  after insert or update or delete on public.mitarbeiter
  for each row execute function public.fn_audit();
