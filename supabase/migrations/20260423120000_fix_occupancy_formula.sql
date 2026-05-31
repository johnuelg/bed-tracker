-- Fix operator precedence in Occupancy Rate formula.
-- Previous: occupied / total_beds - closed * 100  (wrong: multiplies closed by 100)
-- Correct:  (occupied / (total_beds - closed)) * 100
update public.kpi_formulas
set expression = '(occupied / (total_beds - closed)) * 100'
where lower(trim(name)) = 'occupancy rate';
