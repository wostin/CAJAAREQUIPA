// Register.jsx — Con validaciones bancarias reales
import { useState } from 'react';
import Icon from '../components/Icon';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const TIPOS_NEGOCIO = ['Bodega / Abarrotes','Restaurante / Pollería','Transporte / Taxi','Agricultura / Ganadería','Textilería / Confecciones','Ferretería / Materiales','Salud / Farmacia','Educación / Academia','Servicios Generales','Otro'];
const DEPARTAMENTOS = ['Junín','Arequipa','Cusco','Puno','Lima','Tacna','Moquegua','Ayacucho','Apurímac','Huancavelica','Ica','Ancash','La Libertad','Lambayeque','Piura','Cajamarca','Loreto','Ucayali','San Martín','Huánuco'];

const NAVY = '#003366';
const TEAL = '#009688';

// Validar fortaleza de contraseña
function validarPassword(pass) {
  const checks = {
    longitud:   pass.length >= 8,
    mayuscula:  /[A-Z]/.test(pass),
    minuscula:  /[a-z]/.test(pass),
    numero:     /\d/.test(pass),
    especial:   /[!@#$%^&*(),.?":{}|<>]/.test(pass),
  };
  const puntaje = Object.values(checks).filter(Boolean).length;
  return { checks, puntaje, nivel: puntaje<=2?'débil':puntaje<=3?'media':puntaje<=4?'buena':'fuerte' };
}

function PasswordStrength({ pass }) {
  if (!pass) return null;
  const { checks, puntaje, nivel } = validarPassword(pass);
  const colores = { débil:'#DC2626', media:'#F97316', buena:'#EAB308', fuerte:'#16A34A' };
  const color = colores[nivel];
  return (
    <div style={{ marginTop:8 }}>
      <div style={{ display:'flex', gap:4, marginBottom:6 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ flex:1, height:4, borderRadius:2, background:i<=puntaje?color:'#EEF1F8', transition:'.3s' }}/>
        ))}
      </div>
      <div style={{ fontSize:11, color, fontWeight:600, marginBottom:6 }}>Contraseña {nivel}</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
        {[
          ['longitud',  '8+ caracteres'],
          ['mayuscula', 'Mayúscula'],
          ['minuscula', 'Minúscula'],
          ['numero',    'Número'],
          ['especial',  'Símbolo (!@#...)'],
        ].map(([k, label]) => (
          <span key={k} style={{ fontSize:10, padding:'2px 8px', borderRadius:50, background:checks[k]?'#DCFCE7':'#F4F6FB', color:checks[k]?'#16A34A':'#7B84A3', border:`1px solid ${checks[k]?'#86EFAC':'#DDE2F0'}` }}>
            {checks[k] && <Icon name='check' size={12} color='#15803D' style={{display:'inline',verticalAlign:'-1px',marginRight:3}}/>}{label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Register() {
  const [paso, setPaso]   = useState(1);
  const [form, setForm]   = useState({
    nombre:'', apellido:'', dni:'', telefono:'', departamento:'Junín',
    tipo_negocio:'', nombre_negocio:'', email:'', password:'', confirmar:'', rol:'cliente',
  });
  const [showPass, setShowPass]   = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [error, setError]         = useState('');
  const [exito, setExito]         = useState(false);
  const [loading, setLoading]     = useState(false);
  const { register } = useAuth();
  const navigate     = useNavigate();
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const validarPaso1 = () => {
    if (!form.nombre.trim())  { setError('Ingresa tu nombre'); return false; }
    if (!form.apellido.trim()){ setError('Ingresa tu apellido'); return false; }
    if (!/^\d{8}$/.test(form.dni)) { setError('El DNI debe tener 8 dígitos'); return false; }
    if (!/^9\d{8}$/.test(form.telefono)) { setError('El teléfono debe empezar con 9 y tener 9 dígitos'); return false; }
    setError(''); return true;
  };
  const validarPaso2 = () => {
    if (!form.tipo_negocio) { setError('Selecciona el tipo de actividad'); return false; }
    setError(''); return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (form.password !== form.confirmar) { setError('Las contraseñas no coinciden'); return; }
    const { puntaje } = validarPassword(form.password);
    if (puntaje < 3) { setError('La contraseña es muy débil. Usa mayúsculas, números y símbolos.'); return; }
    setLoading(true);
    try {
      await register(form);
      setExito(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear la cuenta.');
    } finally { setLoading(false); }
  };

  const inputStyle = (disabled=false) => ({
    width:'100%', border:'1.5px solid #DDE2F0', borderRadius:10,
    padding:'12px 14px', fontSize:14, outline:'none', boxSizing:'border-box',
    background:disabled?'#F4F6FB':'#fff'
  });

  if (exito) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:`linear-gradient(135deg,${NAVY},#1A3A8F)`, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:'#fff', borderRadius:20, padding:40, textAlign:'center', maxWidth:400, width:'100%', margin:16 }}>
        <div style={{ display:'grid', placeItems:'center', marginBottom:16 }}><div style={{ width:72, height:72, borderRadius:'50%', background:'#DCFCE7', display:'grid', placeItems:'center' }}><Icon name='checkCircle' size={40} color='#15803D'/></div></div>
        <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:700, color:NAVY, marginBottom:8 }}>¡Cuenta creada!</h2>
        <p style={{ color:'#374060', fontSize:14, lineHeight:1.6, marginBottom:20 }}>
          Hola <strong>{form.nombre}</strong>, tu cuenta fue registrada.<br/>
          Ya puedes iniciar sesión con <strong>{form.email}</strong>
        </p>
        <button onClick={() => navigate('/login')} style={{ width:'100%', background:TEAL, color:'#fff', border:'none', padding:13, borderRadius:12, cursor:'pointer', fontFamily:'inherit', fontSize:15, fontWeight:700 }}>
          Ir al login →
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', display:'flex', fontFamily:"'DM Sans',sans-serif" }}>
      {/* Panel izquierdo */}
      <div style={{ flex:1, background:`linear-gradient(135deg,${NAVY},#1A3A8F)`, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 48px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', right:-80, top:-80, width:360, height:360, borderRadius:'50%', background:'rgba(0,188,212,.08)' }}/>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:40 }}>
            <div style={{ width:44, height:44, background:TEAL, borderRadius:12, display:'grid', placeItems:'center' }}><Icon name='bank' size={24} color='#fff'/></div>
            <div>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:18, fontWeight:800, color:'#fff' }}>MiBanco</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:'.1em' }}>Abre tu cuenta</div>
            </div>
          </div>
          <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:32, fontWeight:800, color:'#fff', lineHeight:1.2, marginBottom:16 }}>
            Únete a más de<br/><span style={{ color:'#FFD700' }}>1.8 millones</span><br/>de clientes
          </h1>
          {/* Progress pasos */}
          <div style={{ marginTop:32 }}>
            {[['1','Datos personales'],['2','Tu negocio'],['3','Seguridad']].map(([n,t]) => (
              <div key={n} style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
                <div style={{ width:34, height:34, borderRadius:'50%', background:+n<=paso?TEAL:'rgba(255,255,255,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0, border:+n===paso?'2px solid #FFD700':'none', transition:'.3s' }}>
                  {+n<paso ? <Icon name='check' size={15} color='#fff'/> : n}
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:+n<=paso?'#fff':'rgba(255,255,255,.4)' }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho */}
      <div style={{ width:500, background:'#fff', display:'flex', flexDirection:'column', justifyContent:'center', padding:'48px 44px', overflowY:'auto' }}>
        {/* Barra progreso */}
        <div style={{ display:'flex', gap:4, marginBottom:24 }}>
          {[1,2,3].map(n => <div key={n} style={{ flex:1, height:4, borderRadius:2, background:n<=paso?TEAL:'#EEF1F8', transition:'.3s' }}/>)}
        </div>
        <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:20, fontWeight:700, color:NAVY, marginBottom:4 }}>
          {paso===1?'Datos personales':paso===2?'Actividad económica':'Crea tu acceso'}
        </h2>
        <p style={{ fontSize:12, color:'#7B84A3', marginBottom:20 }}>Paso {paso} de 3</p>

        {error && (
          <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#DC2626', marginBottom:16 }} ><span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon name='alert' size={15} color='#DC2626'/> {error}</span></div>
        )}

        {/* PASO 1 */}
        {paso===1 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>Nombres *</label>
                <input value={form.nombre} onChange={e=>set('nombre',e.target.value)} placeholder="Carlos" style={inputStyle()} onFocus={e=>e.target.style.borderColor=TEAL} onBlur={e=>e.target.style.borderColor='#DDE2F0'}/>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>Apellidos *</label>
                <input value={form.apellido} onChange={e=>set('apellido',e.target.value)} placeholder="Mamani Quispe" style={inputStyle()} onFocus={e=>e.target.style.borderColor=TEAL} onBlur={e=>e.target.style.borderColor='#DDE2F0'}/>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>DNI * <span style={{ color:'#7B84A3', fontWeight:400 }}>(8 dígitos)</span></label>
              <input value={form.dni} onChange={e=>set('dni',e.target.value.replace(/\D/g,'').slice(0,8))} placeholder="40123456" maxLength={8} style={inputStyle()} onFocus={e=>e.target.style.borderColor=TEAL} onBlur={e=>e.target.style.borderColor='#DDE2F0'}/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>Teléfono celular *</label>
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ background:'#F4F6FB', border:'1px solid #DDE2F0', borderRadius:10, padding:'12px', fontSize:13, color:'#374060', flexShrink:0 }}>+51</div>
                <input value={form.telefono} onChange={e=>set('telefono',e.target.value.replace(/\D/g,'').slice(0,9))} placeholder="987654321" maxLength={9} style={{ ...inputStyle(), flex:1 }} onFocus={e=>e.target.style.borderColor=TEAL} onBlur={e=>e.target.style.borderColor='#DDE2F0'}/>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>Departamento</label>
              <select value={form.departamento} onChange={e=>set('departamento',e.target.value)} style={inputStyle()}>
                {DEPARTAMENTOS.map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
            <button onClick={() => { if(validarPaso1()) setPaso(2); }} style={{ background:NAVY, color:'#fff', border:'none', padding:13, borderRadius:12, cursor:'pointer', fontFamily:'inherit', fontSize:15, fontWeight:700, marginTop:4 }}>
              Continuar →
            </button>
          </div>
        )}

        {/* PASO 2 */}
        {paso===2 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>Tipo de actividad *</label>
              <select value={form.tipo_negocio} onChange={e=>set('tipo_negocio',e.target.value)} style={inputStyle()}>
                <option value="">Seleccionar...</option>
                {TIPOS_NEGOCIO.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>Nombre del negocio <span style={{ color:'#7B84A3', fontWeight:400 }}>(opcional)</span></label>
              <input value={form.nombre_negocio} onChange={e=>set('nombre_negocio',e.target.value)} placeholder="Ej. Bodega El Progreso" style={inputStyle()} onFocus={e=>e.target.style.borderColor=TEAL} onBlur={e=>e.target.style.borderColor='#DDE2F0'}/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:8 }}>Tipo de acceso</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[['cliente','user','Cliente','HomeBanking'],['asesor','briefcase','Asesor','Core Financiero']].map(([val,icon,label,sub])=>(
                  <div key={val} onClick={()=>set('rol',val)} style={{ border:`2px solid ${form.rol===val?TEAL:'#DDE2F0'}`, borderRadius:12, padding:14, cursor:'pointer', background:form.rol===val?'#E0F2F1':'#fff', transition:'.2s', textAlign:'center' }}>
                    <div style={{ display:'grid', placeItems:'center', marginBottom:6 }}><Icon name={icon} size={26} color={form.rol===val?TEAL:'#7B84A3'}/></div>
                    <div style={{ fontWeight:600, fontSize:13, color:form.rol===val?TEAL:'#374060' }}>{label}</div>
                    <div style={{ fontSize:11, color:'#7B84A3' }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setPaso(1)} style={{ flex:1, background:'#F4F6FB', color:NAVY, border:'1px solid #DDE2F0', padding:12, borderRadius:12, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>← Atrás</button>
              <button onClick={()=>{ if(validarPaso2()) setPaso(3); }} style={{ flex:2, background:NAVY, color:'#fff', border:'none', padding:12, borderRadius:12, cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>Continuar →</button>
            </div>
          </div>
        )}

        {/* PASO 3 */}
        {paso===3 && (
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label htmlFor="reg-email" style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>
                Correo electrónico * <span style={{ color:'#7B84A3', fontWeight:400 }}>(@mibanco.com o cualquier correo)</span>
              </label>
              <input id="reg-email" type="email" value={form.email} onChange={e=>set('email',e.target.value)}
                placeholder="tu@correo.com" required style={inputStyle()}
                onFocus={e=>e.target.style.borderColor=TEAL} onBlur={e=>e.target.style.borderColor='#DDE2F0'}/>
            </div>
            <div>
              <label htmlFor="reg-pass" style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>Contraseña *</label>
              <div style={{ position:'relative' }}>
                <input id="reg-pass" type={showPass?'text':'password'} value={form.password} onChange={e=>set('password',e.target.value)}
                  placeholder="Mín. 8 caracteres" required style={{ ...inputStyle(), paddingRight:44 }}
                  onFocus={e=>e.target.style.borderColor=TEAL} onBlur={e=>e.target.style.borderColor='#DDE2F0'}/>
                <button type="button" onClick={()=>setShowPass(s=>!s)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:18 }}>
                  <Icon name={showPass?'eyeOff':'eye'} size={18} color='#7B84A3'/>
                </button>
              </div>
              <PasswordStrength pass={form.password}/>
            </div>
            <div>
              <label htmlFor="reg-pass2" style={{ fontSize:12, fontWeight:600, color:'#374060', display:'block', marginBottom:6 }}>Confirmar contraseña *</label>
              <div style={{ position:'relative' }}>
                <input id="reg-pass2" type={showPass2?'text':'password'} value={form.confirmar} onChange={e=>set('confirmar',e.target.value)}
                  placeholder="Repite la contraseña" required style={{ ...inputStyle(), paddingRight:44, borderColor:form.confirmar&&form.confirmar!==form.password?'#DC2626':undefined }}
                  onFocus={e=>e.target.style.borderColor=TEAL} onBlur={e=>e.target.style.borderColor=form.confirmar&&form.confirmar!==form.password?'#DC2626':'#DDE2F0'}/>
                <button type="button" onClick={()=>setShowPass2(s=>!s)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:18 }}>
                  <Icon name={showPass2?'eyeOff':'eye'} size={18} color='#7B84A3'/>
                </button>
              </div>
              {form.confirmar && form.confirmar!==form.password && (
                <p style={{ fontSize:11, color:'#DC2626', marginTop:4 }} ><span style={{display:'inline-flex',alignItems:'center',gap:4}}><Icon name='alert' size={12} color='#DC2626'/> Las contraseñas no coinciden</span></p>
              )}
            </div>
            <div style={{ background:'#EBF8F6', borderRadius:10, padding:12, fontSize:12, color:'#00897B', border:'1px solid #B2DFDB' }}>
              <Icon name='checkCircle' size={15} color='#15803D' style={{display:'inline',verticalAlign:'-2px',marginRight:4}}/><strong>{form.nombre} {form.apellido}</strong> · DNI {form.dni} · {form.tipo_negocio||'Sin negocio'} · {form.departamento} · Rol: {form.rol}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="button" onClick={()=>setPaso(2)} style={{ flex:1, background:'#F4F6FB', color:NAVY, border:'1px solid #DDE2F0', padding:12, borderRadius:12, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>← Atrás</button>
              <button type="submit" disabled={loading} style={{ flex:2, background:TEAL, color:'#fff', border:'none', padding:12, borderRadius:12, cursor:loading?'not-allowed':'pointer', fontFamily:'inherit', fontWeight:700, opacity:loading?0.7:1 }}>
                {loading?'Creando...':'Crear mi cuenta'}
              </button>
            </div>
          </form>
        )}

        <p style={{ textAlign:'center', fontSize:13, color:'#7B84A3', marginTop:20 }}>
          ¿Ya tienes cuenta? <Link to="/login" style={{ color:TEAL, fontWeight:600, textDecoration:'none' }}>Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
