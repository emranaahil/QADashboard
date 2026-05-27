import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import {
  FiActivity,
  FiAlertCircle,
  FiBarChart2,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiFileText,
  FiGlobe,
  FiHome,
  FiInfo,
  FiLoader,
  FiMoon,
  FiPlay,
  FiSearch,
  FiSun,
  FiTrash2,
  FiX,
  FiXCircle,
  FiMenu
} from "react-icons/fi"
import { io } from "socket.io-client"

const navItems = [
  { id: "ui", label: "UI Testing", icon: FiHome },
  { id: "fullsite", label: "Full Site UI", icon: FiGlobe },
  { id: "seo", label: "SEO Testing", icon: FiBarChart2 },
  { id: "sitemap", label: "Sitemap Testing", icon: FiFileText }
]

const steps = [
  { text: "Validating URLs...", progress: 15 },
  { text: "Preparing config...", progress: 30 },
  { text: "Launching browser...", progress: 50 },
  { text: "Capturing screenshots...", progress: 65 },
  { text: "Comparing UI...", progress: 80 },
  { text: "Generating report...", progress: 90 }
]

const seoSteps = [
  { text: "Starting SEO Testing...", progress: 5 },
  { text: "Validating URL...", progress: 15 },
  { text: "Detecting sitemap...", progress: 25 },
  { text: "Extracting URLs...", progress: 35 },
  { text: "Launching browser...", progress: 45 },
  { text: "Scanning pages...", progress: 55 },
  { text: "Running SEO checks...", progress: 65 },
  { text: "Analyzing metadata...", progress: 70 },
  { text: "Checking headings...", progress: 75 },
  { text: "Checking image alt...", progress: 78 },
  { text: "Checking bad links...", progress: 80 },
  { text: "Performing cross-page validation...", progress: 85 },
  { text: "Calculating SEO score...", progress: 88 },
  { text: "Generating report...", progress: 95 }
]


const toastTheme = {
  success: { icon: FiCheckCircle, cls: "toast-success" },
  error: { icon: FiXCircle, cls: "toast-error" },
  warning: { icon: FiAlertCircle, cls: "toast-warning" },
  info: { icon: FiInfo, cls: "toast-info" }
}

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const toastType = toastTheme[toast.type] || toastTheme.info
        const Icon = toastType.icon
        return (
          <div key={toast.id} className={`toast ${toastType.cls}`}>
            <Icon size={16} />
            <p>{toast.message}</p>
            <button onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
              <FiX size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function App() {
  const [testUrl, setTestUrl] = useState("")
  const [referenceUrl, setReferenceUrl] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState("")
  const [openGroups, setOpenGroups] = useState({})
  const [activeTab, setActiveTab] = useState("ui")
  const [logs, setLogs] = useState("")
  const [liveLogs, setLiveLogs] = useState([])
  const [showLogButton, setShowLogButton] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [progress, setProgress] = useState(0)
  const [toasts, setToasts] = useState([])
  const [theme, setTheme] = useState(() => localStorage.getItem("qa-dashboard-theme") || "dark")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [errors, setErrors] = useState({})
  const isSingleUrlModule = activeTab === "seo" || activeTab === "sitemap"
  const isPrimaryModule = ["ui", "fullsite", "seo", "sitemap"].includes(activeTab)
  const moduleTitle =
    activeTab === "ui"
      ? "UI Testing"
      : activeTab === "fullsite"
        ? "Full Site UI"
        : activeTab === "seo"
          ? "SEO Testing"
          : "Sitemap Testing"

  const consoleEndRef = useRef(null)
  const progressRef = useRef(0)
  const stepsIntervalRef = useRef(null)

  const addToast = (type, toastMessage) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev, { id, type, message: toastMessage }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4000)
  }

  const dismissToast = (id) => setToasts((prev) => prev.filter((toast) => toast.id !== id))

  const validateUrls = () => {
    const nextErrors = {}

    try {
      if (!testUrl.trim()) {
        nextErrors.testUrl = "Test URL is required"
      } else {
        new URL(testUrl)
      }
    } catch {
      nextErrors.testUrl = "Please enter a valid URL"
    }

    if (!isSingleUrlModule && referenceUrl.trim()) {
      try {
        new URL(referenceUrl)
      } catch {
        nextErrors.referenceUrl = "Reference URL must be valid"
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const smoothProgressTo100 = () => {
    let value = progressRef.current || 0
    const smooth = setInterval(() => {
      value += 1.5
      setProgress(Math.floor(value))
      progressRef.current = value
      if (value >= 100) clearInterval(smooth)
    }, 40)
  }

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:5000/history")
      const data = await response.json()
      setHistory(data)
    } catch (e) {
      console.log("History Load Error", e)
      setHistoryError("Unable to load history. Please retry.")
      addToast("error", "Failed to fetch test history")
    } finally {
      setHistoryLoading(false)
    }
  }, [setHistory, setHistoryError, setHistoryLoading]);

  const runTest = async () => {
    if (!validateUrls()) {
      addToast("warning", "Please enter a valid URL")
      return
    }

    setLiveLogs([])
    setMessage("")
    setShowLogButton(false)
    setProgress(0)
    setLoading(true)
    setLiveLogs([`Starting ${moduleTitle}...`])
    addToast("info", "Test started...")

    const activeSteps = activeTab === "seo" ? seoSteps : steps

    let stepIndex = 0
    stepsIntervalRef.current = setInterval(() => {
      if (stepIndex < activeSteps.length) {
        const step = activeSteps[stepIndex]
        setLiveLogs((prev) => [...prev, step.text])
        setProgress(step.progress)
        progressRef.current = step.progress
        stepIndex += 1
      } else {
        clearInterval(stepsIntervalRef.current)
      }
    }, 1200)

    try {
      const response = await fetch("http://localhost:5000/run-ui-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testUrl,
          referenceUrl: isSingleUrlModule ? "" : referenceUrl,
          type: activeTab
        })
      })

      const data = await response.json()
      if (data.reportUrl) window.open(data.reportUrl, "_blank")

      if (response.ok || data.status === "execution_failed") {
        clearInterval(stepsIntervalRef.current)
        smoothProgressTo100()
      }

      if (data.status === "execution_failed") {
        setMessage("Execution Failed")
        setLogs(data.logs)
        setShowLogButton(true)
        addToast("error", "Test execution failed")
        setLoading(false)
        return
      }

      if (response.ok) {
        setLiveLogs((prev) => [...prev, `${moduleTitle} completed`])
        setMessage(data.message || "Test completed successfully")
        addToast("success", "Test completed successfully")
        await loadHistory()
      } else {
        setMessage("Execution Failed - Check Logs")
        setLogs(data.logs || "No logs available")
        setShowLogButton(true)
        addToast("error", "Test execution failed")
      }
    } catch (e) {
      console.log("API Error", e)
      setMessage("Something went wrong")
      addToast("error", "Test execution failed")
    } finally {
      setLoading(false)
    }
  }

  const openLogs = () => {
    const logWindow = window.open("", "_blank")
    logWindow.document.write(`<html><head><title>Execution Logs</title></head><body><pre>${logs}</pre></body></html>`)
    logWindow.document.close()
  }

  const requestDeleteHistoryItem = (item) => setConfirmDelete(item)

  const deleteHistoryItem = () => {
    if (!confirmDelete) return
    setHistory((prev) => prev.filter((h) => h.id !== confirmDelete.id))
    setConfirmDelete(null)
    addToast("info", "History item removed from dashboard")
  }

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [liveLogs])

  useEffect(() => {
    const socket = io("http://localhost:5000")

    // Use a timeout to avoid "setState synchronously within an effect" warning
    const timer = setTimeout(() => {
      loadHistory()
    }, 0)

    return () => {
      clearInterval(stepsIntervalRef.current)
      socket.disconnect()
      clearTimeout(timer)
    }
  }, [loadHistory])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("qa-dashboard-theme", theme)
  }, [theme])

  const totalTests = history.length
  const passedTests = history.filter((item) => item.status === "passed").length
  const failedTests = history.filter((item) => item.status === "failed").length
  const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0

  const filteredHistory = useMemo(
    () =>
      history.filter((item) => {
        const matchesSearch = item.testUrl.toLowerCase().includes(searchText.toLowerCase())
        const matchesStatus = statusFilter === "all" ? true : item.status === statusFilter
        const matchesType = item.type === activeTab
        return matchesSearch && matchesStatus && matchesType
      }),
    [history, searchText, statusFilter, activeTab]
  )

  const groupedHistory = useMemo(
    () =>
      filteredHistory.reduce((groups, item) => {
        const date = item.timestamp.split("T")[0]
        if (!groups[date]) groups[date] = []
        groups[date].push(item)
        return groups
      }, {}),
    [filteredHistory]
  )

  const toggleGroup = (date) => setOpenGroups((prev) => ({ ...prev, [date]: !prev[date] }))

  return (
    <div className="app-shell">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand-row">
          <div className="brand-pill">
            <FiActivity size={16} />
            QA Dashboard
          </div>
        </div>
        <nav aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => {
                  setActiveTab(item.id)
                  setSidebarOpen(false)
                }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="main-area">
        <header className="top-header">
          <button className="menu-btn" onClick={() => setSidebarOpen((prev) => !prev)} aria-label="Toggle navigation">
            <FiMenu size={18} />
          </button>
          <div>
            <h1>Hi, QA Member</h1>
            <p>Run visual checks and track release confidence.</p>
          </div>
          <div className="header-actions">
            <span className={`status-pill ${loading ? "running" : "idle"}`}>
              <FiClock size={14} /> {loading ? "Running" : "Idle"}
            </span>
            <button
              className="theme-toggle"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <FiSun size={16} /> : <FiMoon size={16} />}
            </button>
          </div>
        </header>

        {isPrimaryModule ? (
          <section className="dashboard-grid">
            <section className="panel card">
              <h2>{moduleTitle}</h2>

              <label className="field">
                <span>Test URL</span>
                <input
                  type="text"
                  placeholder="https://example.com"
                  value={testUrl}
                  onChange={(e) => {
                    setTestUrl(e.target.value)
                    if (errors.testUrl) setErrors((prev) => ({ ...prev, testUrl: "" }))
                  }}
                  disabled={loading}
                  aria-invalid={Boolean(errors.testUrl)}
                />
                {errors.testUrl && <small className="field-error">{errors.testUrl}</small>}
              </label>

              {!isSingleUrlModule && (
                <label className="field">
                  <span>Reference URL (Optional)</span>
                  <input
                    type="text"
                    placeholder="https://staging.example.com"
                    value={referenceUrl}
                    onChange={(e) => {
                      setReferenceUrl(e.target.value)
                      if (errors.referenceUrl) setErrors((prev) => ({ ...prev, referenceUrl: "" }))
                    }}
                    disabled={loading}
                    aria-invalid={Boolean(errors.referenceUrl)}
                  />
                  {errors.referenceUrl && <small className="field-error">{errors.referenceUrl}</small>}
                </label>
              )}

              <button className="run-btn" onClick={runTest} disabled={loading}>
                {loading ? <FiLoader className="spin" size={16} /> : <FiPlay size={16} />} Run Test
              </button>

              <p className="message-text">{message}</p>

              {loading && (
                <div className="runner-box" role="status" aria-live="polite">
                  <div className="runner-top">
                    <p>Running test pipeline</p>
                    <span>{Number.isFinite(progress) ? progress : 0}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Number.isFinite(progress) ? progress : 0}%` }} />
                  </div>
                  <div className="logs-list">
                    {liveLogs.map((log, index) => (
                      <p key={`${log}-${index}`}>{log}</p>
                    ))}
                    <div ref={consoleEndRef} />
                  </div>
                </div>
              )}

              {showLogButton && (
                <button className="ghost-btn" onClick={openLogs}>
                  View Logs
                </button>
              )}
            </section>

            <aside className="summary-col">
              <div className="card stat-card">
                <p>Total Tests</p>
                <h3>{totalTests}</h3>
              </div>
              <div className="card stat-card">
                <p>Passed</p>
                <h3>{passedTests}</h3>
              </div>
              <div className="card stat-card">
                <p>Failed</p>
                <h3>{failedTests}</h3>
              </div>
              <div className="card stat-card">
                <p>Success Rate</p>
                <h3>{successRate}%</h3>
              </div>
            </aside>

            <section className="panel card history-panel">
              <div className="toolbar">
                <label className="search-wrap">
                  <FiSearch size={14} />
                  <input
                    type="text"
                    placeholder="Search by URL"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status">
                  <option value="all">All Tests</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <h2>Test History</h2>

              {historyLoading && (
                <div className="skeleton-list">
                  <div className="skeleton-card" />
                  <div className="skeleton-card" />
                  <div className="skeleton-card" />
                </div>
              )}

              {!historyLoading && historyError && (
                <div className="empty-state">
                  <FiAlertCircle size={22} />
                  <p>{historyError}</p>
                  <button className="run-btn" onClick={loadHistory}>Retry</button>
                </div>
              )}

              {!historyLoading && !historyError && Object.keys(groupedHistory).length === 0 && (
                <div className="empty-state">
                  <FiFileText size={22} />
                  <p>No test history found for this view.</p>
                </div>
              )}

              {!historyLoading &&
                !historyError &&
                Object.entries(groupedHistory).map(([date, items]) => (
                  <div key={date} className="history-group">
                    <button className="group-toggle" onClick={() => toggleGroup(date)}>
                      {openGroups[date] ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />} {date}
                    </button>
                    {openGroups[date] &&
                      items.map((item) => (
                        <article key={item.id} className="history-item">
                          <div className="history-head">
                            <span className={`badge ${item.status === "passed" ? "pass" : "fail"}`}>
                              {item.status === "passed" ? "Passed" : "Failed"}
                            </span>
                            <button className="icon-btn" onClick={() => requestDeleteHistoryItem(item)} aria-label="Delete history item">
                              <FiTrash2 size={14} />
                            </button>
                          </div>
                          <p><strong>Test:</strong> {item.testUrl}</p>
                          {item.referenceUrl && <p><strong>Reference:</strong> {item.referenceUrl}</p>}
                          <a
                            href={`http://localhost:5000/${item.reportPath || item.pdfPath || ""}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => {
                              if (!item.reportPath && !item.pdfPath) e.preventDefault()
                            }}
                          >
                            Open Report
                          </a>

                        </article>
                      ))}
                  </div>
                ))}
            </section>
          </section>
        ) : null}
      </main>

      {confirmDelete && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="modal-card">
            <h3 id="delete-title">Delete History Item?</h3>
            <p>This will remove the selected history row from the dashboard view.</p>
            <div className="modal-actions">
              <button className="ghost-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="danger-btn" onClick={deleteHistoryItem}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
