import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppIcon } from './AppIcon'
import { StatePanel } from './StatePanel'

type Props = { children: ReactNode; onReset?: () => void }
type State = { error: Error | null }

/** Chặn crash 1 màn làm trắng cả app */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="scroll plain app-state-screen">
          <StatePanel
            tone="error"
            title="Không thể hiển thị nội dung"
            message="Thử về trang chính. Nếu vẫn lỗi, tải lại trang để nhận bản mới."
            action={
              <>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    this.setState({ error: null })
                    this.props.onReset?.()
                  }}
                >
                  <AppIcon name="arrow-left" size={18} />
                  Về trang chính
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    void (async () => {
                      try {
                        if ('serviceWorker' in navigator) {
                          const regs = await navigator.serviceWorker.getRegistrations()
                          await Promise.all(regs.map((r) => r.unregister()))
                        }
                        if ('caches' in window) {
                          const keys = await caches.keys()
                          await Promise.all(keys.map((k) => caches.delete(k)))
                        }
                      } catch {
                        /* ignore */
                      }
                      location.reload()
                    })()
                  }}
                >
                  Tải lại ứng dụng
                </button>
              </>
            }
          />
        </div>
      )
    }
    return this.props.children
  }
}
