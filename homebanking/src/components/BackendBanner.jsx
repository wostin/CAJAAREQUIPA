// Banner global: avisa si el backend (:3000) no responde, con guía clara.
import { useState, useEffect } from 'react';
import Icon from './Icon';
import api from '../api/axios';

export default function BackendBanner() {
  const [estado, setEstado] = useState('checking'); // checking | ok | down

  useEffect(() => {
    let vivo = true;
    const check = () => {
      api.get('/api/health', { timeout: 4000 })
        .then(() => vivo && setEstado('ok'))
        .catch(() => vivo && setEstado('down'));
    };
    check();
    const t = setInterval(check, 15000); // re-chequea cada 15 s
    return () => { vivo = false; clearInterval(t); };
  }, []);

  if (estado !== 'down') return null;

  return (
    <div style={{
      background: 'linear-gradient(90deg,#7f1d1d,#b91c1c)', color: '#fff',
      padding: '8px 16px', fontSize: 12.5, fontFamily: "'DM Sans',system-ui,sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      position: 'sticky', top: 0, zIndex: 9999, fontWeight: 600,
    }}>
      <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon name='alert' size={14} color='currentColor'/> El servidor (backend :3000) no responde.</span>
      <span style={{ opacity: .85, fontWeight: 400 }}>
        Abre una terminal en <b>backend/</b> y ejecuta <code style={{ background: 'rgba(0,0,0,.25)', padding: '1px 6px', borderRadius: 4 }}>npm run dev</code> (revisa que exista backend/.env).
      </span>
    </div>
  );
}
