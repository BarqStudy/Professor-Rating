// Small local vector sculptures: shaded faces, bevels and cast shadows.
// Each home action owns its paint IDs so the four scenes never share gradients.
export function homeIcon(kind){
 const id='home-3d-'+kind;
 const paint=name=>`url(#${id}-${name})`;
 const scenes={
  ratings:`
   <path d="M17 56 49 45 79 57v13L47 83 17 70Z" fill="${paint('edge')}"/>
   <path d="m17 56 31-12 31 12-32 13Z" fill="${paint('accent')}"/>
   <path d="m22 61 25 10 26-10v7L47 78 22 68Z" fill="${paint('paper')}"/>
   <path d="m25 66 21 8m5-1 19-7" stroke="#9aaabd" stroke-width="1" opacity=".6"/>
   <path d="M17 29q16-9 31 0 16-10 31-2v30Q63 50 48 62 32 51 17 59Z" fill="${paint('edge')}" transform="translate(0 4)"/>
   <path d="M17 29q16-9 31 0v33Q32 51 17 59Z" fill="${paint('paper')}"/>
   <path d="M48 29q16-10 31-2v30Q63 50 48 62Z" fill="${paint('page')}"/>
   <path d="M48 30v30M23 36q9-3 18 1m-18 7q9-3 18 1m-18 6q9-2 17 1m15-17q9-5 17-3m-17 11q9-5 17-3" fill="none" stroke="var(--object-edge)" stroke-width="2" stroke-linecap="round" opacity=".38"/>
   <path d="M19 29q15-7 28 1m3 0q15-10 27-3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/>
   <circle cx="72" cy="65" r="15" fill="#92622a"/>
   <circle cx="70" cy="62" r="15" fill="${paint('gold')}" stroke="#fff1c5" stroke-width="1"/>
   <path d="m70 52 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#fffaf0" stroke="#b77b29" stroke-width=".7"/>
   <path d="M59 58a12 12 0 0 1 14-7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".65"/>`,
  add:`
   <g transform="rotate(-9 46 45)">
    <rect x="23" y="16" width="51" height="61" rx="11" fill="${paint('edge')}"/>
    <rect x="18" y="12" width="51" height="61" rx="11" fill="${paint('paper')}" stroke="#fff" stroke-width="1"/>
    <path d="M29 13h29a10 10 0 0 1 10 10H19a10 10 0 0 1 10-10" fill="${paint('accent')}"/>
    <path d="M25 17h24" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>
    <circle cx="44" cy="38" r="10" fill="${paint('sphere')}"/>
    <path d="M27 63v-3c0-8 7-13 17-13s17 5 17 13v3q-17 6-34 0" fill="${paint('accent')}"/>
    <path d="M32 57q5-6 13-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".4"/>
    <path d="M25 28v33" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>
   </g>
   <circle cx="72" cy="70" r="16" fill="#92622a"/>
   <circle cx="70" cy="66" r="16" fill="${paint('gold')}" stroke="#fff0bc" stroke-width="1"/>
   <path d="M70 58v16m-8-8h16" stroke="#fffaf2" stroke-width="4" stroke-linecap="round"/>
   <path d="M59 62a12 12 0 0 1 14-7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".65"/>`,
  plan:`
   <path d="M26 40v19q20 19 43 0V40Z" fill="${paint('accent')}"/>
   <path d="M26 47v12q7 7 14 9V52Z" fill="${paint('edge')}" opacity=".6"/>
   <path d="m11 34 37-18 38 18v7L48 60 11 41Z" fill="${paint('edge')}"/>
   <path d="m11 34 37-19 38 19-38 19Z" fill="${paint('accent')}" stroke="var(--object-light)" stroke-width="1" stroke-linejoin="round"/>
   <path d="m18 34 30-15 28 14" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".45"/>
   <path d="m48 34 25 9v18" fill="none" stroke="#a16c27" stroke-width="3.5" stroke-linecap="round"/>
   <path d="m48 33 23 9v19" fill="none" stroke="${paint('gold')}" stroke-width="2.5" stroke-linecap="round"/>
   <circle cx="48" cy="33" r="3" fill="var(--object-light)"/>
   <path d="M68 61q3-4 6 0l2 9h-10Z" fill="${paint('gold')}"/>
   <g transform="rotate(-12 46 75)">
    <rect x="22" y="68" width="48" height="15" rx="7.5" fill="${paint('paper')}"/>
    <path d="M27 71h35" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="68" cy="75.5" rx="5.5" ry="7.5" fill="${paint('page')}" stroke="#b4bfcc" stroke-width="1"/>
    <ellipse cx="68" cy="75.5" rx="2.5" ry="4" fill="#9eacbc"/>
    <path d="M43 68h8v15h-8Z" fill="${paint('gold')}"/>
    <path d="m43 80-2 10 6-3 5 3-1-10Z" fill="${paint('gold')}"/>
   </g>`,
  advisor:`
   <g transform="rotate(-12 31 47)">
    <rect x="14" y="24" width="37" height="49" rx="9" fill="${paint('edge')}"/>
    <rect x="11" y="21" width="37" height="49" rx="9" fill="${paint('accent')}" stroke="var(--object-light)" stroke-width="1"/>
    <circle cx="29" cy="39" r="8" fill="${paint('paper')}"/>
    <path d="M17 61v-3q0-10 12-10t12 10v3Z" fill="${paint('paper')}"/>
   </g>
   <g transform="rotate(8 57 43)">
    <rect x="38" y="14" width="41" height="58" rx="10" fill="${paint('edge')}"/>
    <rect x="34" y="10" width="41" height="58" rx="10" fill="${paint('paper')}" stroke="#fff" stroke-width="1"/>
    <circle cx="54" cy="31" r="9" fill="${paint('sphere')}"/>
    <path d="M40 57v-3q0-12 14-12t14 12v3q-14 5-28 0" fill="${paint('accent')}"/>
    <path d="M45 50q3-5 10-5" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity=".45"/>
   </g>
   <circle cx="72" cy="72" r="16" fill="#92622a"/>
   <circle cx="70" cy="68" r="16" fill="${paint('gold')}" stroke="#fff0bc" stroke-width="1"/>
   <path d="m62 68 5 5 10-11" fill="none" stroke="#fffaf2" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M59 64a12 12 0 0 1 14-7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".65"/>`,
 };
 return `<span class="action-icon action-icon-3d" aria-hidden="true"><svg class="home-3d-icon" data-home-icon="${kind}" viewBox="0 0 96 96" fill="none" focusable="false"><defs>
  <linearGradient id="${id}-accent" x1="16" y1="15" x2="76" y2="76" gradientUnits="userSpaceOnUse"><stop stop-color="var(--object-light)"/><stop offset=".5" stop-color="var(--object-accent)"/><stop offset="1" stop-color="var(--object-edge)"/></linearGradient>
  <linearGradient id="${id}-edge" x1="22" y1="28" x2="74" y2="84" gradientUnits="userSpaceOnUse"><stop stop-color="var(--object-accent)"/><stop offset="1" stop-color="var(--object-edge)"/></linearGradient>
  <linearGradient id="${id}-paper" x1="20" y1="20" x2="70" y2="78" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset=".55" stop-color="#f4f7fb"/><stop offset="1" stop-color="#b8c7d7"/></linearGradient>
  <linearGradient id="${id}-page" x1="50" y1="30" x2="80" y2="62" gradientUnits="userSpaceOnUse"><stop stop-color="#d1deea"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#e2eaf2"/></linearGradient>
  <linearGradient id="${id}-gold" x1="52" y1="49" x2="79" y2="84" gradientUnits="userSpaceOnUse"><stop stop-color="#fff0b6"/><stop offset=".45" stop-color="#e9bc67"/><stop offset="1" stop-color="#ba7c2b"/></linearGradient>
  <radialGradient id="${id}-sphere" cx=".3" cy=".22" r=".85"><stop stop-color="var(--object-light)"/><stop offset=".5" stop-color="var(--object-accent)"/><stop offset="1" stop-color="var(--object-edge)"/></radialGradient>
  <filter id="${id}-shadow" x="-.3" y="-1" width="1.6" height="3"><feGaussianBlur stdDeviation="2.2"/></filter>
 </defs><ellipse cx="48" cy="85" rx="30" ry="4" fill="#102438" opacity=".2" filter="${paint('shadow')}"/>${scenes[kind]}</svg></span>`;
}
