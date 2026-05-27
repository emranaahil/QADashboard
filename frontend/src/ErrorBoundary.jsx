import { Component } from "react"

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error("UI Error Boundary:", error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "20px", background: "#071A12", color: "#F5F7FA" }}>
          <div style={{ maxWidth: "500px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px", background: "rgba(255,255,255,0.06)" }}>
            <h2>Something went wrong</h2>
            <p style={{ color: "#A7B3AF" }}>The dashboard hit an unexpected error. You can reload and try again.</p>
            <button onClick={this.handleReload} style={{ marginTop: "12px", border: 0, borderRadius: "10px", padding: "10px 14px", cursor: "pointer", background: "#0F8F6F", color: "#fff" }}>
              Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
