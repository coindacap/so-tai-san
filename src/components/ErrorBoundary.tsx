import { Component, type ErrorInfo, type ReactNode } from 'react'

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
        <div className="scroll plain" style={{ paddingTop: 48, textAlign: 'center' }}>
          <h3 style={{ marginBottom: 8 }}>Có lỗi hiển thị màn này</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45, marginBottom: 16 }}>
            {this.state.error.message || 'Lỗi không xác định'}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              this.setState({ error: null })
              this.props.onReset?.()
            }}
          >
            Về trang chủ
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
