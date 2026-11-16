-- Run after schema.sql. Cleanup continues while browsers are closed.
create extension if not exists pg_cron;
create schema if not exists lab_life_private;
revoke all on schema lab_life_private from public, anon, authenticated;

create or replace function lab_life_private.prune_expired(value jsonb, at_time timestamptz default now())
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 result jsonb;
 adjustments jsonb;
 today text := to_char(at_time at time zone (value->>'timezone'),'YYYY-MM-DD');
begin
 select coalesce(jsonb_agg(item order by item->>'start',item->>'end',(item->'labs')::text),'[]'::jsonb) into adjustments
 from (
  select distinct jsonb_build_object('start',item->>'start','end',item->>'end','labs',item->'labs') as item
  from (
   select item from jsonb_array_elements(coalesce(value->'hourAdjustments','[]'::jsonb)) e(item)
   union all
   select item from jsonb_array_elements(value->'closures') e(item)
  ) candidates
  where item->>'end' > today||'T00:00'
   and ((item->>'end')::timestamp at time zone (value->>'timezone')) <= at_time
 ) unique_adjustments;
 select jsonb_set(jsonb_set(value, '{submissions}',
  coalesce((select jsonb_agg(item order by ord)
   from jsonb_array_elements(value->'submissions') with ordinality e(item,ord)
   where item->>'date' >= to_char(at_time at time zone (value->>'timezone'),'YYYY-MM-DD')), '[]'::jsonb)),
  '{closures}', coalesce((select jsonb_agg(item order by ord)
   from jsonb_array_elements(value->'closures') with ordinality e(item,ord)
   where ((item->>'end')::timestamp at time zone (value->>'timezone')) > at_time), '[]'::jsonb)) into result;
 -- Only the minimal opening-hour interval survives until local midnight.
 -- The expired announcement's title, description and ID are removed.
 if adjustments = '[]'::jsonb then return result - 'hourAdjustments'; end if;
 return jsonb_set(result,'{hourAdjustments}',adjustments);
end;
$$;
revoke all on function lab_life_private.prune_expired(jsonb,timestamptz) from public, anon, authenticated;
grant usage on schema lab_life_private to service_role;
grant execute on function lab_life_private.prune_expired(jsonb,timestamptz) to service_role;

-- Protect against expired entries being restored by an old tab or backup.
create or replace function lab_life_private.clean_board_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 -- A stale editor may not know about a cleanup that already ran. Preserve the
 -- stored day's adjustments before pruning the new snapshot.
 if TG_OP = 'UPDATE' then
  new.content := jsonb_set(new.content,'{hourAdjustments}',
   coalesce(new.content->'hourAdjustments','[]'::jsonb) || coalesce(old.content->'hourAdjustments','[]'::jsonb));
 end if;
 new.content := lab_life_private.prune_expired(new.content, now());
 return new;
end;
$$;
revoke all on function lab_life_private.clean_board_write() from public, anon, authenticated;
grant execute on function lab_life_private.clean_board_write() to service_role;
create or replace trigger ll_boards_remove_expired
 before insert or update of content on public.ll_boards
 for each row execute function lab_life_private.clean_board_write();

-- Expiry is monotonic and does not alter editors' content revision. Every write
-- also prunes, so an editor can keep working without resurrecting expired items.
select cron.schedule('lab-life-remove-expired','* * * * *', $job$
 update public.ll_boards b
 set content = lab_life_private.prune_expired(b.content, now())
 where b.content is distinct from lab_life_private.prune_expired(b.content, now());
$job$);

