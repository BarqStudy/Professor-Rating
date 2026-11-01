// Keep source positions so an invalid pasted name can be selected without
// rewriting the user's list or losing the original line numbers.
export function parseDoctorBatch(source) {
  const names = [], seen = new Set(), issues = [];
  let line = 0, overflow = null;
  for (const match of source.matchAll(/([^\r\n\u2028\u2029]*)(\r\n|[\r\n\u2028\u2029]|$)/g)) {
    line++;
    const name = match[1].normalize('NFKC').replace(/\s+/g, ' ')
      .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
    if (!name) continue;
    const row = {line, name, start: match.index, end: match.index + match[1].length};
    let reason = '';
    if (name.length > 100) reason = `الاسم أطول من 100 حرف (${name.length} حرفًا).`;
    else if (name.length < 8) reason = 'الاسم أقصر من 8 أحرف.';
    else if (name.split(/\s+/).length < 3) reason = 'اكتب الاسم الثلاثي؛ المدخل أقل من ثلاث كلمات.';
    if (reason) issues.push({...row, reason});
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
      if (names.length === 101) overflow = row;
    }
  }
  return {
    names, issues,
    message: !names.length ? 'أضف اسم دكتور واحدًا على الأقل، كل اسم في سطر مستقل.'
      : names.length > 100 ? `كتبت ${names.length} اسمًا مختلفًا؛ الحد 100 اسم في الدفعة. قسّم القائمة إلى أكثر من دفعة.` : '',
    first: overflow || issues[0] || null,
  };
}
