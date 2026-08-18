import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/workbench.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Missing #root')
}

try {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (err) {
  console.error('[boot]', err)
  rootEl.innerHTML =
    '<div style="padding:24px;font-family:system-ui;line-height:1.5">' +
    '<h1 style="font-size:20px;margin:0 0 8px">Không mở được sổ</h1>' +
    '<p style="margin:0 0 12px;color:#555">Thử tải lại trang. Nếu vẫn lỗi, xóa cache site rồi mở lại.</p>' +
    '<button id="so-reload" type="button" style="min-height:44px;padding:0 16px;border-radius:12px;border:0;background:#9b1c2e;color:#fff;font-weight:700">Tải lại</button>' +
    '</div>'
  document.getElementById('so-reload')?.addEventListener('click', () => {
    location.reload()
  })
}

// PWA: network-first SW — tránh white screen sau deploy (index cũ trỏ bundle đã xóa)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`
    void navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // Force update check when app opens
        void reg.update()
        if (reg.waiting) {
          reg.waiting.postMessage('SKIP_WAITING')
        }
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing
          if (!sw) return
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage('SKIP_WAITING')
            }
          })
        })
      })
      .catch(() => {
        /* ignore — private mode / blocked */
      })
  })
}
