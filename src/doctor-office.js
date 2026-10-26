const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function officeLabel(doctor){
 if(doctor?.office_role==='head')return 'رئيس قسم';
 if(doctor?.office_role==='dean'&&doctor.office_college){
  return 'عميد '+(doctor.office_college.startsWith('كلية')?'':'كلية ')+doctor.office_college;
 }
 return '';
}
export function officeBadge(doctor){
 const label=officeLabel(doctor);
 return label?`<span class="office-badge">${esc(label)}</span>`:'';
}
