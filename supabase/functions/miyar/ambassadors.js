import { ApiError, integer, text } from './security.js';
const id = (value) => integer(value, 1, Number.MAX_SAFE_INTEGER, 'المعرّف');
const rpc = (db, name, body = {}) => db('rpc/' + name, { method: 'POST', body });

export async function catalogueProposal(action, body, user, account, db) {
  if (!['doctor.correction', 'ambassador.propose'].includes(action)) return null;
  if (user.status !== 'active') throw new ApiError(403, 'حسابك مقيّد عن الإرسال.');
  const ambassador = action === 'ambassador.propose';
  const kind = ambassador ? body.kind : 'doctor.correct';
  if (!['doctor.add', 'college.add', 'major.add', 'doctor.correct', 'college.correct', 'major.correct'].includes(kind)) {
    throw new ApiError(400, 'اختر نوع المقترح.');
  }
  if (!ambassador && !user.university_id) throw new ApiError(400, 'اختر جامعتك أولًا.');
  const name = text(body.name, kind.startsWith('doctor.') ? 8 : 2, 100, 'الاسم المقترح');
  if (kind.startsWith('doctor.') && name.split(/\s+/).length < 3) throw new ApiError(400, 'اكتب اسم الدكتور الثلاثي.');
  const result = await rpc(db, 'miyar_propose_catalogue', {
    p_account: account,
    p_kind: kind,
    p_university: ambassador ? id(body.universityId) : user.university_id,
    p_target: kind.endsWith('.correct') ? id(body.targetId) : null,
    p_parent: kind.startsWith('college.') ? null : id(body.parentId),
    p_name: name,
    p_details: text(body.details || '', 0, 600, 'تفاصيل التصحيح'),
    p_ambassador: ambassador,
  });
  return { status: 201, data: result };
}

// Called only after the handler's server-side administrator check.
export async function ambassadorAdmin(operation, body, actor, db) {
  if (operation === 'ambassador.set') {
    const email = text(body.email, 3, 254, 'البريد الإلكتروني').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof body.active !== 'boolean') throw new ApiError(400, 'تحقق من البريد والإجراء.');
    return rpc(db, 'miyar_set_ambassador', { p_actor: actor, p_email: email, p_university: id(body.universityId), p_active: body.active });
  }
  if (['catalogue.approve', 'catalogue.reject'].includes(operation)) {
    const approve = operation.endsWith('.approve');
    return rpc(db, 'miyar_decide_catalogue', { p_actor: actor, p_id: id(body.id), p_approve: approve, p_reason: text(body.reason || '', approve ? 0 : 3, 300, 'سبب الرفض') });
  }
  return null;
}
