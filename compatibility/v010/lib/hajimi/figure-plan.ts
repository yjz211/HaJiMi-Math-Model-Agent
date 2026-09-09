import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
function local(cwd: string, path: string) {
  const result = resolve(cwd, path), rel = relative(cwd, result);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Plan sources must stay within the task workspace');
  return result;
}
export function figurePlanErrors(plan: any, minimum = 8): string[] {
  const errors: string[] = [], figures = Array.isArray(plan?.figures) ? plan.figures : [];
  const data = figures.filter((f: any) => f.class === 'DATA');
  if (data.length < Math.max(8, minimum)) errors.push(`DATA requires at least ${Math.max(8, minimum)} distinct figures (PDF/PNG and panels do not count separately)`);
  const ids = new Set(), types = new Map<string, number>();
  for (const f of figures) {
    if (!/^(fig_|tikz_)[a-z0-9_]+$/.test(f.id ?? '') || ids.has(f.id)) errors.push(`Invalid or duplicate figure id: ${f.id}`);
    ids.add(f.id);
    for (const k of ['chartType', 'reason', 'message', 'section', 'question', 'layout']) if (typeof f[k] !== 'string' || !f[k].trim()) errors.push(`${f.id}: missing ${k}`);
    if (!['DATA','DRAWIO','TIKZ'].includes(f.class)) errors.push(`${f.id}: class must be DATA/DRAWIO/TIKZ`);
    if (!/^(basic|advanced|empirical|competition|academic)\s*#\s*\d+$|^custom$/.test(f.recipe ?? '')) errors.push(`${f.id}: recipe must be category #N or custom`);
    if (!Array.isArray(f.sources) || !f.sources.length) errors.push(`${f.id}: sources required`);
    if (!Array.isArray(f.outputs) || !f.outputs.includes(`figures/${f.id}.pdf`)) errors.push(`${f.id}: outputs must include figures/${f.id}.pdf`);
    if (!(f.finalWidthMm > 0)) errors.push(`${f.id}: finalWidthMm required`);
    if (f.class === 'DATA') {
      const type = (f.chartType ?? '').trim().toLowerCase(); types.set(type, (types.get(type) ?? 0) + 1);
    }
  }
  for (const [type, n] of types) if (n > 3) errors.push(`Repeated chartType ${type}: ${n} > 3; use canonical names, not aliases to evade this check`);
  if (!figures.some((f: any) => f.class === 'DRAWIO' && f.purpose === 'roadmap')) errors.push('Full plan requires one DRAWIO overall roadmap');
  if (!Array.isArray(plan?.questions) || !plan.questions.length) errors.push('questions classification required');
  for (const q of plan?.questions ?? []) {
    if (!q.id || !['reasoning','data','mixed'].includes(q.kind)) errors.push('Each question requires id and kind reasoning/data/mixed');
    if (!figures.some((f: any) => f.question === q.id)) errors.push(`${q.id}: no planned figure`);
    if (q.kind === 'reasoning' && !figures.some((f: any) => f.question === q.id && f.class === 'TIKZ' && f.purpose === 'derivation')) errors.push(`${q.id}: reasoning question requires true derivation construction`);
    if (q.spatial && !figures.some((f: any) => f.question === q.id && f.class === 'DATA' && f.spatial === true)) errors.push(`${q.id}: spatial evidence plot required`);
    if (q.modelCount >= 3 && new Set(figures.filter((f: any) => f.question === q.id && f.class === 'DATA').map((f: any) => f.chartType)).size < 2) errors.push(`${q.id}: >=3 models require >=2 comparison types`);
  }
  return errors;
}
export async function validateFigurePlan(cwd: string, planPath: string) {
  const policyPath = join(cwd, '.hajimi/figure-plan-policy.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8').catch(() => '{"minimum":8}'));
  const text = await readFile(local(cwd, planPath), 'utf8'), plan = JSON.parse(text);
  const errors = figurePlanErrors(plan, policy.minimum ?? 8);
  for (const f of plan.figures ?? []) for (const source of f.sources ?? []) {
    try { if (!(await stat(local(cwd, source))).isFile()) throw new Error(); } catch { errors.push(`${f.id}: missing/nonlocal source ${source}`); }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(policyPath, JSON.stringify({ ...policy, required: true, planPath, planHash: digest(text) }, null, 2));
  return { valid: true, figures: plan.figures.length, dataFigures: plan.figures.filter((f: any) => f.class === 'DATA').length, note: '18–30 DATA figures is a soft reference, not a quota. This validates the contract, not design quality.' };
}
export async function beginFigurePlan(cwd: string, minimum = 8) {
  if (!Number.isInteger(minimum) || minimum < 8) throw new Error('Minimum must be an integer >=8; raise only for an explicit user request');
  await writeFile(join(cwd, '.hajimi/figure-plan-policy.json'), JSON.stringify({ required: true, minimum }, null, 2));
  return 'Upstream full-set planning enabled. Read source material and bundled upstream-planning.md with read/ls/find/grep. Write FIGURE_PLAN.json, then validate. Commands are paused until the plan passes.';
}
export async function requireFigurePlan(cwd: string) {
  const policy = JSON.parse(await readFile(join(cwd, '.hajimi/figure-plan-policy.json'), 'utf8').catch(() => '{}'));
  if (!policy.required) return;
  const text = policy.planPath ? await readFile(local(cwd, policy.planPath), 'utf8').catch(() => '') : '';
  if (!policy.planHash || digest(text) !== policy.planHash) throw new Error('Complete the upstream FIGURE_PLAN.json and call hajimi_validate_figure_plan before executing commands. Use read/ls/find/grep for planning; a changed plan must be revalidated.');
}
