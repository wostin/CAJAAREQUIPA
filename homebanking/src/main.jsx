// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const root = document.getElementById('root');
if (!root) {
  document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:red">❌ Error: no se encontró #root en index.html</div>';
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
