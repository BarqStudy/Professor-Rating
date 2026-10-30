const dateFormat=new Intl.DateTimeFormat('en-GB',{calendar:'gregory',numberingSystem:'latn',timeZone:'Asia/Riyadh',day:'2-digit',month:'2-digit',year:'numeric'});
export function reviewDate(value){
 if(!value)return 'التاريخ غير متاح';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'التاريخ غير متاح':dateFormat.format(date);
}
