/**
 * Đồng bộ history trình duyệt với nav app.
 * Tránh vuốt mép trái iOS Safari bị “Back” ra trang web trước (Google, v.v.).
 */

let ignorePop = 0

export function pushAppHistory() {
  try {
    history.pushState({ soTaiSan: true }, '')
  } catch {
    /* ignore */
  }
}

export function replaceAppHistory() {
  try {
    history.replaceState({ soTaiSan: true }, '')
  } catch {
    /* ignore */
  }
}

/** Gọi sau khi store đã goBack — đồng bộ stack browser (nút Back / vuốt app) */
export function syncBrowserBack() {
  ignorePop += 1
  try {
    history.back()
  } catch {
    ignorePop = Math.max(0, ignorePop - 1)
  }
}

export function bindBrowserBack(goBackInApp: () => boolean): () => void {
  replaceAppHistory()

  const onPop = () => {
    if (ignorePop > 0) {
      ignorePop -= 1
      return
    }
    // Safari / Chrome edge-swipe = popstate
    const ok = goBackInApp()
    if (!ok) {
      // Đang ở tab gốc — chặn rời site
      pushAppHistory()
    }
  }

  window.addEventListener('popstate', onPop)
  return () => window.removeEventListener('popstate', onPop)
}
