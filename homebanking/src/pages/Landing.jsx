// Landing.jsx — Réplica fiel a cajaarequipa.pe con soporte Español/Quechua
import { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon';
import { Link } from 'react-router-dom';

const NAVY='#062a52', TEAL='#16b8c6', TEAL2='#0fa0ad', ORANGE='#f39200', LIGHT='#f4f7fb', INK='#1f2a44', MUTE='#7b89a3', GREEN='#00a86b';

// ── Fallback de imágenes ──────────────────────────────────
const onErr=(e)=>{const t=e.target,s=t.dataset.s||'0';if(s==='0'){t.dataset.s='1';t.src=t.dataset.fb||'';}else{t.style.visibility='hidden';}};
const Img=({src,fb,alt='',style})=><img src={src} data-fb={fb} onError={onErr} alt={alt} style={style}/>;

// ── Traducciones completas ES / QU ─────────────────────────
const T = {
  es: {
    // Nav
    productos:'Productos', canales:'Canales Digitales', beneficios:'Beneficios', agencias:'Nuestras Agencias',
    pideTuCredito:'Pide tu crédito', bancaInternet:'Banca por Internet',
    slogan:'40 años · Inclusión financiera que transforma vidas',
    // Hero
    hero:[
      { h:'¡Goolazo Emprendedor!', p:'Impulsa tu negocio. Pide tu crédito y participa por una TV de 65", paleta mundialista y un maletín Adidas.', cta:'Solicita tu crédito aquí' },
      { h:'Ahorra y haz crecer tu dinero', p:'Cuentas de ahorro, depósitos a plazo fijo y CTS con tasas competitivas y respaldo de la SBS.', cta:'Conoce nuestras cuentas' },
      { h:'Tu Banca por Internet, 24/7', p:'Consulta saldos, paga servicios y solicita tu crédito 100% en línea, desde donde estés.', cta:'Ingresar ahora' },
    ],
    // Haz crecer tu negocio
    hacerCrecer:'Haz crecer tu negocio con un crédito de Caja Arequipa',
    usos:[
      ['cart','Abastecer productos'],['hammer','Remodelar casa o local comercial'],['laptop','Compra de nuevos equipos y tecnología'],
      ['briefcase','Stock variado de productos y servicios'],['store','Nuevos locales comerciales'],['megaphone','Campañas comerciales de venta'],
    ],
    // Beneficios
    beneficiosTitulo:'Beneficios de Caja Arequipa',
    beneficiosCards:[
      { ic:'card', t:'Créditos según tu necesidad', d:'Brindamos créditos según la necesidad de nuestros clientes' },
      { ic:'smartphone', t:'Paga tu cuota', d:'Monitorea el estado de tu crédito y paga al instante desde tu negocio o casa' },
      { ic:'lock', t:'Facilidades de pagos', d:'100% seguro' },
    ],
    // Canales digitales
    canalesTitulo:'Canales Digitales',
    canalesSubtitulo:'Tus operaciones 100% online, sin filas, desde tu negocio o casa, los 7 días de la semana',
    canales3:[
      { ic:'laptop', t:'Banca por Internet', d:'Realiza tus operaciones desde tu celular, laptop o Tablet' },
      { ic:'smartphone', t:'APP Caja Arequipa Móvil', d:'Realiza tus operaciones desde la aplicación móvil' },
      { ic:'send', t:'Desembolso 100% Digital', d:'Realiza tu desembolso desde nuestra APP Móvil' },
    ],
    // Tarjetas
    tarjeta1:{ h:'Aprovecha los beneficios de ser nuestro cliente', cta:'Conoce los descuentos aquí' },
    tarjeta2:{ h:'40 años de inclusión financiera', cta:'Conoce nuestra historia' },
    // Cifras
    cifrasTitulo:'Caja Arequipa en cifras',
    cifrasNota:'Cierre 2025 · Fuente: Memoria Anual 2025 / SBS',
    cifras:[
      {v:'1,490,277',l:'Clientes a nivel nacional'},{v:'232',l:'Oficinas (212 propias)'},
      {v:'2,294',l:'Puntos de atención'},{v:'5,795',l:'Colaboradores'},
      {v:'S/ 10,300 MM',l:'Colocaciones (+9.6%)'},{v:'S/ 8,888 MM',l:'Depósitos (+9%)'},
    ],
    // Footer
    footerCols:[
      {t:'Caja Arequipa',items:['Nosotros','Noticias','Sostenibilidad','Red de agencias','CajaLab','Línea ética','Canal de denuncias']},
      {t:'Legales',items:['Transparencia','Ley de protección de datos personales','Requerimientos de documentación']},
      {t:'Ayuda',items:['Información de interés','Preguntas frecuentes','Contacta a tu analista','Servicios','Bloquear tarjeta']},
    ],
    ubicanos:'Ubícanos', verPuntos:'Ver puntos de atención', siguenos:'Síguenos',
    contacto:'Contacto', central:'Central Telefónica:', chatea:'Chatea por WhatsApp',
    copyright:`© ${new Date().getFullYear()} CMAC Arequipa · Proyecto académico`,
    quechua:'Quechua', espanol:'Español',
    // Premios
    premios:['Premio Effie Plata 2025','Premios ABE 2025','Reconocimiento Perú Sostenible','Clasificación de riesgo A+','+800 mil horas de capacitación'],
    reconocTitulo:'Reconocimientos',
  },
  qu: {
    productos:'Rurasqakuna', canales:'Ñawpaqmanta Ñankuna', beneficios:'Allin Kapuykuna', agencias:'Wasi Llamkayninchik',
    pideTuCredito:'Qullqita mañakuy', bancaInternet:'Internet Banca',
    slogan:'40 wata · Qullqi yanapakuy kawsayta tikrachin',
    hero:[
      { h:'¡Hatun Emprendedor!', p:'Llamkayniykita wiñachiy. Qullqiykita mañakuy, 65" televisorta, mundialista paleta, Adidas maletinta apankipaqmi.', cta:'Qullqita mañakuy kaypi' },
      { h:'Qullqiykita waqaychay wiñachiy', p:'Qullqi waqaychana, plazo fijo, CTS nisqakunata tasas allinkunawan SBS yanapakuyninwan.', cta:'Cuentakunata riqsiy' },
      { h:'Internet Bankay, tukuy p\'unchaw', p:'Qullqiykita rimanay, huchuycha pagay, 100% ñawpaqmanta mañakuy, maypimapis kashankipi.', cta:'Yaykuy kunan' },
    ],
    hacerCrecer:'Llamkayniykita Caja Arequipawan wiñachiy',
    usos:[
      ['cart','Rantikuna apay'],['hammer','Wasiykita allichay'],['laptop','Mosqoy t\'aqwikuna rantiy'],
      ['briefcase','Tukuy laya rantikunata waqaychay'],['store','Mosqoy rantikunapaq wasi'],['megaphone','Qhatuy ruwakuna'],
    ],
    beneficiosTitulo:'Caja Arequipaq Allin Kapuykuna',
    beneficiosCards:[
      { ic:'card', t:'Mañakuykuna munayniykirayku', d:'Runap munayninrayku qullqita qun' },
      { ic:'smartphone', t:'Pagayniykita pay', d:'Qullqiykita qhaway, payay wasiykipi llamkayniykipi kanmantapacha' },
      { ic:'lock', t:'Pagay allinmanta', d:'100% waqaychana' },
    ],
    canalesTitulo:'Ñawpaqmanta Ñankuna',
    canalesSubtitulo:'Ruranakuyniyki 100% ñawpaqmanta, mana saynata, llamkayniykipi wasiykipi, 7 p\'unchaw semanapi',
    canales3:[
      { ic:'laptop', t:'Internet Banca', d:'Ruranakuyniykita celular, laptop, tabletmanta ruway' },
      { ic:'smartphone', t:'APP Caja Arequipa Móvil', d:'Ruranakuyniykita aplicación móvil nisqamanta ruway' },
      { ic:'send', t:'Qullqi Chasqiy 100% Digital', d:'Qullqiykita APP Móvilmanta chasqiy' },
    ],
    tarjeta1:{ h:'Nuqanchik clientenku kaptiykipi allin kapuykuna', cta:'Descuentokunata riqsiy' },
    tarjeta2:{ h:'40 wata qullqi yanapakuymanta', cta:'Historiyanchikta riqsiy' },
    cifrasTitulo:'Caja Arequipa yupaychasqan',
    cifrasNota:'Tukuy 2025 · Fuente: Memoria Anual 2025 / SBS',
    cifras:[
      {v:'1,490,277',l:'Cliente nación llaqtanpi'},{v:'232',l:'Oficinakuna (212 rantin)'},
      {v:'2,294',l:'Yanapay punkukuna'},{v:'5,795',l:'Llamkaqkuna'},
      {v:'S/ 10,300 MM',l:'Qullqi quy (+9.6%)'},{v:'S/ 8,888 MM',l:'Qullqi waqaychana (+9%)'},
    ],
    footerCols:[
      {t:'Caja Arequipa',items:['Nuqanchikkuna','Willakuykuna','Suyuy kawsay','Wasi red','CajaLab','Llakiy ñan','Willakuy kanal']},
      {t:'Leyes',items:['Qhaway paq','Personas datos waqaychana ley','Qellqa mañakuykuna']},
      {t:'Yanapay',items:['Willakuy allin','Tapukuy astawan','Analistan rimanakuy','Servicios','Tarjeta wisq\'ay']},
    ],
    ubicanos:'Taripaywayku', verPuntos:'Yanapay punkukunata qhaway', siguenos:'Qhipanchikta katiy',
    contacto:'Rimay', central:'Rimay Telefono:', chatea:'WhatsApp nisqamanta rimay',
    copyright:`© ${new Date().getFullYear()} CMAC Arequipa · Yachaqana proyecto`,
    quechua:'Quechua', espanol:'Español',
    premios:['Premio Effie Plata 2025','Premios ABE 2025','Reconocimiento Perú Sostenible','Clasificación riesgo A+','+800 mil capacitación horas'],
    reconocTitulo:'Riqsichikuykuna',
  }
};

// ── Hero carrusel ──────────────────────────────────────────
const HERO_IMGS = [
  'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
];

function Hero({ t }) {
  const [idx, setIdx] = useState(0);
  const [pause, setPause] = useState(false);
  const len = t.hero.length;
  useEffect(() => {
    if (pause) return;
    const id = setInterval(() => setIdx(i => (i + 1) % len), 4500);
    return () => clearInterval(id);
  }, [pause, len]);
  const s = t.hero[idx];
  return (
    <section style={{ position:'relative', overflow:'hidden', minHeight:340, background:NAVY }}>
      <img src={HERO_IMGS[idx]} alt="" onError={e=>e.target.style.display='none'}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:.35, transition:'opacity .5s' }} />
      <div style={{ position:'relative', zIndex:2, maxWidth:680, padding:'60px 6vw 80px', color:'#fff' }}>
        <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:38, fontWeight:900, lineHeight:1.1, margin:'0 0 14px', textShadow:'0 2px 14px rgba(0,0,0,.4)' }}>{s.h}</h1>
        <p style={{ fontSize:15, lineHeight:1.6, margin:'0 0 26px', opacity:.9, maxWidth:500 }}>{s.p}</p>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <Link to="/login" style={{ background:TEAL, color:'#fff', padding:'12px 28px', borderRadius:28, textDecoration:'none', fontWeight:800, fontSize:14 }}>{s.cta}</Link>
          <button onClick={()=>{}} style={{ background:'transparent', border:'1px solid rgba(255,255,255,.6)', color:'#fff', padding:'12px 22px', borderRadius:28, cursor:'pointer', fontSize:14 }}>Ver términos</button>
        </div>
      </div>
      {/* Dots */}
      <div style={{ position:'absolute', bottom:18, left:'6vw', display:'flex', gap:8, zIndex:3 }}>
        {t.hero.map((_,i)=>(
          <button key={i} onClick={()=>{setIdx(i);setPause(true);setTimeout(()=>setPause(false),6000);}}
            aria-label={`Slide ${i+1}`}
            style={{ width:i===idx?22:9, height:9, borderRadius:9, background:i===idx?TEAL:'rgba(255,255,255,.5)', border:'none', cursor:'pointer', transition:'width .3s' }}/>
        ))}
        <button onClick={()=>setPause(p=>!p)} style={{ marginLeft:4, background:'rgba(255,255,255,.18)', border:'none', color:'#fff', width:24, height:24, borderRadius:'50%', cursor:'pointer', fontSize:13 }}>{pause?'▶':'‖'}</button>
      </div>
    </section>
  );
}

// ── "Haz crecer tu negocio" ────────────────────────────────
function HacerCrecer({ t }) {
  return (
    <section style={{ background:'#fff', padding:'52px 5vw' }}>
      <h2 style={{ textAlign:'center', color:NAVY, fontFamily:"'Sora',sans-serif", fontSize:26, marginBottom:36 }}>{t.hacerCrecer}</h2>
      <div style={{ maxWidth:1100, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr 280px', gap:24, alignItems:'start' }}>
        <div>
          {t.usos.slice(0,3).map(([ic,label])=>(
            <div key={label} style={{ display:'flex', gap:14, alignItems:'center', marginBottom:22, background:LIGHT, borderRadius:12, padding:'14px 16px' }}>
              <span style={{ flexShrink:0, display:'grid', placeItems:'center' }}><Icon name={ic} size={24} color={TEAL}/></span>
              <span style={{ fontWeight:600, color:INK, fontSize:13.5, lineHeight:1.4 }}>{label}</span>
            </div>
          ))}
        </div>
        <div>
          {t.usos.slice(3).map(([ic,label])=>(
            <div key={label} style={{ display:'flex', gap:14, alignItems:'center', marginBottom:22, background:LIGHT, borderRadius:12, padding:'14px 16px' }}>
              <span style={{ flexShrink:0, display:'grid', placeItems:'center' }}><Icon name={ic} size={24} color={TEAL}/></span>
              <span style={{ fontWeight:600, color:INK, fontSize:13.5, lineHeight:1.4 }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ position:'relative', borderRadius:20, overflow:'hidden', background:`linear-gradient(135deg,${TEAL},${NAVY})`, minHeight:280, display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:20 }}>
          <img src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=400&q=80" alt="" onError={e=>e.target.style.display='none'}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:.4 }}/>
          <div style={{ position:'relative', zIndex:2 }}>
            <Link to="/login" style={{ background:ORANGE, color:'#fff', padding:'11px 22px', borderRadius:24, textDecoration:'none', fontWeight:800, fontSize:13.5, display:'inline-block' }}>{t.pideTuCredito}</Link>
          </div>
        </div>
      </div>
      {/* slide dot */}
      <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:18 }}>
        <span style={{ width:20, height:7, borderRadius:7, background:TEAL, display:'inline-block' }}/>
        <span style={{ width:7, height:7, borderRadius:7, background:'#d0d8e6', display:'inline-block' }}/>
      </div>
    </section>
  );
}

// ── Beneficios ──────────────────────────────────────────────
function Beneficios({ t }) {
  return (
    <section style={{ background:LIGHT, padding:'52px 5vw' }}>
      <h2 style={{ textAlign:'center', color:NAVY, fontFamily:"'Sora',sans-serif", fontSize:26, marginBottom:32 }}>{t.beneficiosTitulo}</h2>
      <div style={{ maxWidth:1000, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
        {t.beneficiosCards.map(b=>(
          <div key={b.t} style={{ background:'#fff', borderRadius:18, padding:'28px 22px', textAlign:'center', boxShadow:'0 2px 12px rgba(6,42,82,.07)' }}>
            <div style={{ width:72, height:72, borderRadius:'50%', background:'#e7f6f8', display:'grid', placeItems:'center', margin:'0 auto 14px' }}><Icon name={b.ic} size={32} color={TEAL}/></div>
            <h3 style={{ color:NAVY, fontFamily:"'Sora',sans-serif", fontSize:16, marginBottom:8 }}>{b.t}</h3>
            <p style={{ color:MUTE, fontSize:13, lineHeight:1.55 }}>{b.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Canales Digitales ──────────────────────────────────────
function CanalesDigitales({ t }) {
  const CANAL_IMGS = [
    'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=400&q=70',
    'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=400&q=70',
    'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=400&q=70',
  ];
  return (
    <section style={{ background:`linear-gradient(135deg,${NAVY} 0%,#0a3a6b 100%)`, padding:'52px 5vw', color:'#fff' }}>
      <div style={{ maxWidth:1100, margin:'0 auto', display:'grid', gridTemplateColumns:'280px 1fr', gap:40, alignItems:'center' }}>
        <div>
          <p style={{ fontSize:11, letterSpacing:2, textTransform:'uppercase', color:TEAL, marginBottom:8 }}>{t.canalesTitulo}</p>
          <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:26, lineHeight:1.25, margin:'0 0 0', color:'#fff' }}>
            {t.canalesSubtitulo.split(' ').map((w,i)=>(
              ['100%','7','online,'].includes(w)||['100%','7'].includes(w)
                ? <span key={i} style={{ color:TEAL }}>{w} </span>
                : w + ' '
            ))}
          </h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
          {t.canales3.map((c,i)=>(
            <div key={c.t} style={{ background:'rgba(255,255,255,.08)', borderRadius:16, overflow:'hidden', border:'1px solid rgba(255,255,255,.12)' }}>
              <div style={{ height:130, overflow:'hidden', background:'rgba(255,255,255,.05)' }}>
                <img src={CANAL_IMGS[i]} alt="" onError={e=>e.target.style.display='none'}
                  style={{ width:'100%', height:'100%', objectFit:'cover', opacity:.7 }}/>
              </div>
              <div style={{ padding:'14px 16px' }}>
                <div style={{ marginBottom:6, display:'grid', placeItems:'center' }}><Icon name={c.ic} size={22} color={TEAL}/></div>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:5 }}>{c.t}</div>
                <div style={{ fontSize:11.5, opacity:.7, lineHeight:1.5 }}>{c.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Tarjetas promo ─────────────────────────────────────────
function TarjetasPromo({ t }) {
  return (
    <section style={{ background:LIGHT, padding:'40px 5vw' }}>
      <div style={{ maxWidth:1000, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <div style={{ background:`linear-gradient(135deg,${TEAL},${TEAL2})`, borderRadius:18, padding:'32px 28px', color:'#fff', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:160 }}>
          <p style={{ fontSize:18, fontWeight:800, fontFamily:"'Sora',sans-serif", lineHeight:1.3, margin:'0 0 20px' }}>{t.tarjeta1.h}</p>
          <Link to="/login" style={{ background:'#fff', color:TEAL2, padding:'10px 20px', borderRadius:24, textDecoration:'none', fontWeight:800, fontSize:13, alignSelf:'flex-start' }}>{t.tarjeta1.cta}</Link>
        </div>
        <div style={{ background:`linear-gradient(135deg,${NAVY},${NAVY}cc)`, backgroundImage:`url(https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=600&q=60)`, backgroundSize:'cover', backgroundBlendMode:'multiply', borderRadius:18, padding:'32px 28px', color:'#fff', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:160 }}>
          <p style={{ fontSize:18, fontWeight:800, fontFamily:"'Sora',sans-serif", lineHeight:1.3, margin:'0 0 20px' }}>{t.tarjeta2.h}</p>
          <Link to="/login" style={{ background:ORANGE, color:'#fff', padding:'10px 20px', borderRadius:24, textDecoration:'none', fontWeight:800, fontSize:13, alignSelf:'flex-start' }}>{t.tarjeta2.cta}</Link>
        </div>
      </div>
    </section>
  );
}

// ── Cifras ─────────────────────────────────────────────────
const ANIOS=['2020','2021','2022','2023','2024','2025'];
const COLOC=[5.7,6.5,7.6,8.7,9.5,10.3], DEPOS=[5.10,5.52,5.93,7.11,8.15,8.89];

function Cifras({ t }) {
  const max=11, W=560, H=200, pad=30, gw=(W-pad*2)/ANIOS.length, yv=v=>H-pad-(v/max)*(H-pad*2);
  return (
    <section style={{ background:'#fff', padding:'52px 5vw' }}>
      <h2 style={{ textAlign:'center', color:NAVY, fontFamily:"'Sora',sans-serif", fontSize:24, marginBottom:4 }}>{t.cifrasTitulo}</h2>
      <p style={{ textAlign:'center', color:MUTE, fontSize:12, marginBottom:28 }}>{t.cifrasNota}</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, maxWidth:1100, margin:'0 auto 36px' }}>
        {t.cifras.map(c=>(
          <div key={c.l} style={{ background:LIGHT, borderRadius:14, padding:'20px 14px', textAlign:'center' }}>
            <div style={{ fontFamily:"'Sora',sans-serif", color:TEAL2, fontSize:22, fontWeight:800 }}>{c.v}</div>
            <div style={{ color:'#5b6b86', fontSize:12, marginTop:5, lineHeight:1.4 }}>{c.l}</div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth:680, margin:'0 auto', border:'1px solid #eef1f8', borderRadius:16, padding:'20px 22px' }}>
        <svg viewBox={`0 0 ${W} ${H+22}`} style={{ width:'100%' }}>
          {[0,2,4,6,8,10].map(g=>(<g key={g}><line x1={pad} y1={yv(g)} x2={W-pad} y2={yv(g)} stroke="#e6ebf2"/><text x={pad-6} y={yv(g)+3} fontSize="9" fill="#9aa6bd" textAnchor="end">{g}</text></g>))}
          {ANIOS.map((a,i)=>{ const cx=pad+gw*i+gw/2,bw=13; return (
            <g key={a}><rect x={cx-bw-2} y={yv(COLOC[i])} width={bw} height={H-pad-yv(COLOC[i])} rx="3" fill={NAVY}/><rect x={cx+2} y={yv(DEPOS[i])} width={bw} height={H-pad-yv(DEPOS[i])} rx="3" fill={TEAL}/><text x={cx} y={H-pad+13} fontSize="9" fill="#5b6b86" textAnchor="middle">{a}</text></g>
          );})}
        </svg>
        <div style={{ display:'flex', gap:18, justifyContent:'center', marginTop:8, fontSize:12, color:'#5b6b86' }}>
          <span><span style={{ display:'inline-block', width:10, height:10, background:NAVY, borderRadius:3, marginRight:5 }}/>Colocaciones</span>
          <span><span style={{ display:'inline-block', width:10, height:10, background:TEAL, borderRadius:3, marginRight:5 }}/>Depósitos</span>
        </div>
      </div>
    </section>
  );
}

// ── Reconocimientos ────────────────────────────────────────
function Reconocimientos({ t }) {
  return (
    <section style={{ background:LIGHT, padding:'36px 5vw' }}>
      <h2 style={{ textAlign:'center', color:NAVY, fontFamily:"'Sora',sans-serif", fontSize:22, marginBottom:18 }}>{t.reconocTitulo}</h2>
      <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap', maxWidth:1000, margin:'0 auto' }}>
        {t.premios.map(p=><span key={p} style={{ background:'#fff', border:`1.5px solid ${TEAL}`, color:NAVY, padding:'8px 16px', borderRadius:24, fontSize:12.5, fontWeight:600 }} ><span style={{display:'inline-flex',alignItems:'center',gap:5}}><Icon name='medal' size={14} color={TEAL}/> {p}</span></span>)}
      </div>
    </section>
  );
}

// ── Nav ────────────────────────────────────────────────────
function NavBar({ lang, setLang, t }) {
  const [open, setOpen] = useState(false);
  const PROD=[{ic:'money',label:'Ahorros'},{ic:'card',label:'Crédito'},{ic:'shield',label:'Seguros'},{ic:'transfer',label:'Tipo de Cambio'}];
  return (
    <>
      {/* Top bar */}
      <div style={{ background:'#f0f4f8', borderBottom:'1px solid #dce3ee', padding:'5px 5vw', fontSize:11.5, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ color:MUTE }}>
          <span style={{ background:ORANGE, color:'#fff', padding:'2px 10px', borderRadius:12, marginRight:8, fontWeight:700 }}>Negocios</span>
          <span style={{ color:NAVY, fontWeight:600, cursor:'pointer' }}>Personas</span>
        </span>
        <span style={{ display:'flex', gap:6 }}>
          <button onClick={()=>setLang('es')} style={{ background:lang==='es'?NAVY:'transparent', color:lang==='es'?'#fff':MUTE, border:`1px solid ${lang==='es'?NAVY:'#ccc'}`, padding:'3px 12px', borderRadius:14, cursor:'pointer', fontSize:11, fontWeight:700 }}>{t.espanol}</button>
          <button onClick={()=>setLang('qu')} style={{ background:lang==='qu'?TEAL:'transparent', color:lang==='qu'?'#fff':MUTE, border:`1px solid ${lang==='qu'?TEAL:'#ccc'}`, padding:'3px 12px', borderRadius:14, cursor:'pointer', fontSize:11, fontWeight:700 }}>{t.quechua}</button>
        </span>
      </div>
      {/* Nav */}
      <nav style={{ background:NAVY, color:'#fff', padding:'13px 5vw', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <img src="/img/logo-caja-arequipa.png" alt="Caja Arequipa" style={{ height:44, objectFit:'contain' }}/>
          <span style={{ fontSize:9, opacity:.55 }}>{t.slogan}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:22, flexWrap:'wrap', fontSize:13.5 }}>
          <div style={{ position:'relative' }} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
            <span style={{ cursor:'pointer', opacity:.9, display:'flex', alignItems:'center', gap:5 }}>{t.productos} <span style={{ fontSize:10 }}>▾</span></span>
            {open&&(
              <div style={{ position:'absolute', top:'130%', left:0, background:'#fff', borderRadius:14, boxShadow:'0 12px 40px rgba(6,42,82,.22)', padding:10, width:260, zIndex:60 }}>
                {PROD.map(p=><div key={p.label} style={{ display:'flex', gap:12, alignItems:'center', padding:'10px 12px', borderRadius:10, cursor:'pointer', color:INK }}><span style={{ display:'grid', placeItems:'center' }}><Icon name={p.ic} size={20} color={TEAL}/></span><span style={{ fontWeight:700, color:NAVY, fontSize:13 }}>{p.label}</span></div>)}
              </div>
            )}
          </div>
          {[t.canales, t.beneficios, t.agencias].map(n=><span key={n} style={{ opacity:.88, cursor:'pointer' }}>{n}</span>)}
          <span style={{ cursor:'pointer', opacity:.88, display:'inline-grid', placeItems:'center' }}><Icon name='search' size={18} color='#fff'/></span>
          <Link to="/login" style={{ border:'1px solid rgba(255,255,255,.5)', color:'#fff', padding:'8px 16px', borderRadius:24, textDecoration:'none', fontWeight:600, fontSize:13 }}>{t.pideTuCredito}</Link>
          <Link to="/login" data-lock style={{ background:TEAL, color:'#fff', padding:'9px 18px', borderRadius:24, textDecoration:'none', fontWeight:700, fontSize:13 }} ><span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon name='lock' size={14} color='#fff'/> {t.bancaInternet}</span></Link>
        </div>
      </nav>
    </>
  );
}

// ── Footer ─────────────────────────────────────────────────
const SVG_ICONS = {
  facebook:'M13 22v-8h3l1-4h-4V8c0-1.1.4-2 2-2h2V2.2C18.4 2.1 17.3 2 16 2c-3 0-5 1.8-5 5.2V10H8v4h3v8h2z',
  youtube:'M22 8.2a3 3 0 0 0-2.1-2.1C18 5.5 12 5.5 12 5.5s-6 0-7.9.6A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12a31 31 0 0 0 .4 3.8 3 3 0 0 0 2.1 2.1c1.9.6 7.9.6 7.9.6s6 0 7.9-.6a3 3 0 0 0 2.1-2.1c.3-1.3.4-2.5.4-3.8s-.1-2.6-.4-3.8zm-12 6V9l5 3-5 3z',
  instagram:'M12 7.5A4.5 4.5 0 1 0 16.5 12 4.5 4.5 0 0 0 12 7.5zm0 7.4A2.9 2.9 0 1 1 14.9 12 2.9 2.9 0 0 1 12 14.9zm5.8-7.6a1 1 0 1 1-1-1 1 1 0 0 1 1 1zM21 8.3a5.2 5.2 0 0 0-1.4-3.7A5.2 5.2 0 0 0 15.9 3c-1.4-.1-5.4-.1-6.8 0A5.2 5.2 0 0 0 5.4 4.6 5.2 5.2 0 0 0 4 8.3c-.1 1.4-.1 5.4 0 6.8a5.2 5.2 0 0 0 1.4 3.7 5.2 5.2 0 0 0 3.7 1.4c1.4.1 5.4.1 6.8 0a5.2 5.2 0 0 0 3.7-1.4 5.2 5.2 0 0 0 1.4-3.7c.1-1.4.1-5.4 0-6.8zm-2 8.3a2.9 2.9 0 0 1-1.7 1.7c-1.1.5-3.8.4-5.1.4s-4 .1-5.1-.4a2.9 2.9 0 0 1-1.7-1.7c-.5-1.1-.4-3.8-.4-5.1s-.1-4 .4-5.1A2.9 2.9 0 0 1 6.9 5c1.1-.5 3.8-.4 5.1-.4s4-.1 5.1.4a2.9 2.9 0 0 1 1.7 1.7c.5 1.1.4 3.8.4 5.1s.1 4-.4 5.1z',
  whatsapp:'M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2zm4.4 14c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.3 7.3 0 0 1-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4c0-.1-.5-1.3-.7-1.7s-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3A2.8 2.8 0 0 0 6 8.6a4.9 4.9 0 0 0 1 2.6 11 11 0 0 0 4.3 3.8c1.6.7 1.9.5 2.3.5a2.5 2.5 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c0-.1-.2-.2-.4-.3z',
};
function SocialBtn({tipo}) {
  return <span style={{ width:32, height:32, borderRadius:8, background:NAVY, border:'1px solid rgba(255,255,255,.2)', display:'inline-grid', placeItems:'center', cursor:'pointer' }}><svg viewBox="0 0 24 24" width="15" height="15" fill="#fff"><path d={SVG_ICONS[tipo]||SVG_ICONS.whatsapp}/></svg></span>;
}

function Footer({ t }) {
  return (
    <footer style={{ background:'#fff', borderTop:'1px solid #e6ebf2', padding:'0 5vw 32px' }}>
      <div style={{ textAlign:'center', marginTop:-20, marginBottom:8 }}>
        <button onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} style={{ width:40, height:40, borderRadius:'50%', background:TEAL, border:'none', color:'#fff', cursor:'pointer', boxShadow:'0 2px 10px rgba(22,184,198,.4)', fontSize:18 }}>↑</button>
      </div>
      <div style={{ maxWidth:1200, margin:'0 auto', paddingTop:20, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:26 }}>
        {t.footerCols.map(col=>(
          <div key={col.t}>
            <h4 style={{ color:NAVY, fontFamily:"'Sora',sans-serif", fontSize:14, marginBottom:12, fontWeight:800 }}>{col.t}</h4>
            {col.items.map(it=><div key={it} style={{ color:MUTE, fontSize:12.5, marginBottom:10, cursor:'pointer' }}>{it}</div>)}
          </div>
        ))}
        <div>
          <h4 style={{ color:NAVY, fontFamily:"'Sora',sans-serif", fontSize:14, marginBottom:12, fontWeight:800 }}>{t.ubicanos}</h4>
          <div style={{ color:TEAL2, fontSize:13, fontWeight:600, marginBottom:22, cursor:'pointer' }}> {t.verPuntos}</div>
          <h4 style={{ color:NAVY, fontFamily:"'Sora',sans-serif", fontSize:14, marginBottom:12, fontWeight:800 }}>{t.siguenos}</h4>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{['facebook','youtube','instagram','whatsapp'].map(s=><SocialBtn key={s} tipo={s}/>)}</div>
        </div>
        <div>
          <h4 style={{ color:NAVY, fontFamily:"'Sora',sans-serif", fontSize:14, marginBottom:12, fontWeight:800 }}>{t.contacto}</h4>
          <div style={{ color:MUTE, fontSize:12.5, marginBottom:4 }}>{t.central}</div>
          <div style={{ color:NAVY, fontWeight:700, fontSize:13, marginBottom:16 }}>(51) (54) 380670 / 0800-20222</div>
          <div style={{ color:MUTE, fontSize:12.5, marginBottom:6 }}>{t.chatea}</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, color:NAVY, fontWeight:700, fontSize:14 }}><SocialBtn tipo="whatsapp"/> (51) 915 078 000</div>
        </div>
      </div>
      <div style={{ maxWidth:1200, margin:'24px auto 0', borderTop:'1px solid #e6ebf2', paddingTop:14, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:10, fontSize:12, color:'#9aa6bd', alignItems:'center' }}>
        <img src="/img/logo-caja-arequipa.png" alt="Caja Arequipa" style={{ height:30, objectFit:'contain' }}/>
        <span>{t.copyright}</span>
        <Link to="/login" style={{ color:TEAL2, textDecoration:'none', fontWeight:700 }} ><span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon name='lock' size={14} color={TEAL2}/> {t.bancaInternet} →</span></Link>
      </div>
    </footer>
  );
}

// ── Export principal ───────────────────────────────────────
export default function Landing() {
  const [lang, setLang] = useState('es');
  const t = T[lang];
  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", background:'#fff', color:INK }}>
      <NavBar lang={lang} setLang={setLang} t={t} />
      <Hero t={t} />
      <HacerCrecer t={t} />
      <Beneficios t={t} />
      <CanalesDigitales t={t} />
      <TarjetasPromo t={t} />
      <Cifras t={t} />
      <Reconocimientos t={t} />
      <Footer t={t} />
    </div>
  );
}
