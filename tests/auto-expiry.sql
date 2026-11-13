-- Pure SQL fixtures: no production rows are inserted, changed or removed.
do $$
declare
 source jsonb := '{"timezone":"Europe/Madrid","campus":"Fixture","hours":{"preserved":true},"posters":[{"id":"poster"}],"submissions":[{"id":"old","date":"2026-11-12"},{"id":"today","date":"2026-11-13","time":"00:00","completed":true},{"id":"next","date":"2026-11-14"}],"closures":[{"id":"ended","end":"2026-11-13T12:00"},{"id":"ongoing","end":"2026-11-13T12:01"}]}';
 cleaned jsonb;
begin
 cleaned := lab_life_private.prune_expired(source,'2026-11-13T11:00:00Z');
 if cleaned->'submissions' <> '[{"id":"today","date":"2026-11-13","time":"00:00","completed":true},{"id":"next","date":"2026-11-14"}]'::jsonb then raise exception 'Wrong local submission expiry'; end if;
 if cleaned->'closures' <> '[{"id":"ongoing","end":"2026-11-13T12:01"}]'::jsonb then raise exception 'Wrong exclusive end boundary'; end if;
 if cleaned->'hours' <> source->'hours' or cleaned->'posters' <> source->'posters' or cleaned->'campus' <> source->'campus' then raise exception 'Unrelated content changed'; end if;
 if lab_life_private.prune_expired(cleaned,'2026-11-13T11:00:00Z') <> cleaned then raise exception 'Cleanup is not idempotent'; end if;
 cleaned := lab_life_private.prune_expired(source,'2026-11-13T23:00:00Z');
 if cleaned->'submissions' <> '[{"id":"next","date":"2026-11-14"}]'::jsonb then raise exception 'Madrid midnight mismatch'; end if;
 cleaned := lab_life_private.prune_expired('{"timezone":"Europe/Madrid","submissions":[{"date":"2027-03-28"}],"closures":[{"end":"2027-03-29T00:00"}]}','2027-03-28T22:00:00Z');
 if cleaned->'submissions' <> '[]'::jsonb or cleaned->'closures' <> '[]'::jsonb then raise exception 'DST boundary mismatch'; end if;
end;
$$;
select 'PASS: local midnight, saved-hour independence, exclusive closure end, DST, stable order, unrelated data and idempotence' as result;

