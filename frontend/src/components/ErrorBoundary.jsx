import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      let parsed = null
      try {
        parsed = JSON.parse(this.state.error.message)
      } catch {
        parsed = null
      }
      const message = parsed
        ? `Operation ${parsed.operationType || 'write'} on ${parsed.path || 'workspace'} failed: ${parsed.error}`
        : this.state.error.message || 'An unexpected workspace error occurred.'

      return (
        <main className="selection-page">
          <section className="auth-card error-panel" role="alert">
            <h1>Workspace protection notice</h1>
            <p>{message}</p>
            <div className="actions">
              <button
                className="primary"
                type="button"
                onClick={() => {
                  this.setState({ error: null })
                  window.location.assign('/app/overview')
                }}
              >
                Reload workspace
              </button>
            </div>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}
