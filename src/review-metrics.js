const labels=['الشرح','التعامل','المساعدة بالدرجات'];
// Public scores are independent of the student's course grade. Missing values
// must never become invented zeroes, and invalid input cannot enter CSS/ARIA.
export function reviewMetrics(scores,{empty=false}={}){
 return `<div class="review-metrics">${labels.map((label,index)=>{
  const value=scores?.[index],valid=!empty&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
  const tone=valid?(value<50?'poor':value<=65?'fair':value<=80?'good':value<=89?'very-good':'excellent'):'unavailable';
  const shown=valid?value.toLocaleString('en-US',{maximumFractionDigits:1}):'—';
  return `<div class="review-metric" data-score-tone="${tone}"><div class="review-metric-label"><span>${label}</span><bdi class="review-metric-value">${shown}${valid?'<small> / 100</small>':''}</bdi></div><span class="review-metric-track" ${valid?`role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"`:`aria-label="${label}: غير متاح"`}><i style="width:${valid?value:0}%"></i></span></div>`;
 }).join('')}</div>`;
}
