"use client";

import { useEffect, useRef, useState } from "react";
import { ADMIN_CONFIG_API_BASE_URL, getStoredAdminConfigToken } from "../../lib/admin-config-auth";
import { Badge, Button } from "../ui";

type ListSection = {
  title?: string;
  rows: Array<{ id: string; title: string }>;
};

type MessageList = {
  button: string;
  sections: ListSection[];
};

type Message = {
  id: string;
  sender: "user" | "bot" | "system";
  text: string;
  timestamp: string;
  buttons?: string[];
  list?: MessageList;
};

type SessionInfo = {
  phone: string;
  state: string;
  // Derived label from the backend: "lesson_view" / "quiz_in_progress" while
  // the stored state machine value stays "module_menu" (R3-F5/6/9).
  displayState?: string;
  name?: string;
  language?: string;
  location?: string;
  lastUpdatedAt?: string;
};

export function WhatsAppSandboxSimulator() {
  const [phone, setPhone] = useState("+2348031234567");
  const [inputText, setInputText] = useState("Hello SheTrades");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init-1",
      sender: "system",
      text: "ℹ️ Simulator Ready. In a real-world flow, a user clicks a QR code or link which pre-fills their chat with 'Hello SheTrades'. Click Send to simulate this initial ping and trigger the name prompt.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isFetchingSession, setIsFetchingSession] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchSessionDetails = async (phoneNum: string) => {
    if (!phoneNum.trim()) return;
    try {
      setIsFetchingSession(true);
      const sessionToken = getStoredAdminConfigToken();
      const res = await fetch(
        `${ADMIN_CONFIG_API_BASE_URL}/webhook/whatsapp/session/${encodeURIComponent(phoneNum.trim())}`,
        sessionToken ? { headers: { authorization: `Bearer ${sessionToken}` } } : undefined
      );
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      } else {
        setSession(null);
      }
    } catch (err) {
      console.error("Failed to fetch session:", err);
    } finally {
      setIsFetchingSession(false);
    }
  };

  useEffect(() => {
    if (phone.trim()) {
      const timer = setTimeout(() => {
        void fetchSessionDetails(phone.trim());
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [phone]);

  const handleSend = async (
    e?: React.FormEvent,
    buttonText?: string,
    listRow?: { id: string; title: string }
  ) => {
    if (e) e.preventDefault();
    const textToSend = buttonText ? buttonText.trim() : inputText.trim();
    if (!textToSend || isLoading) return;

    if (!buttonText) {
      setInputText("");
    }
    const userMsgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setFeedback(null);

    // Format payload the way Meta does: a tapped LIST row arrives as a
    // list_reply carrying the row's canonical id (which the handler prefers -
    // ids like "__states_page_2__" or a lesson key are load-bearing); a tapped
    // BUTTON arrives as a button_reply; anything else is plain text.
    type SandboxInboundMessage = {
      id: string;
      from: string;
      interactive?:
        | { type: "button_reply"; button_reply: { id: string; title: string } }
        | { type: "list_reply"; list_reply: { id: string; title: string } };
      text?: { body: string };
    };
    const messageObj: SandboxInboundMessage = {
      id: userMsgId,
      from: phone.trim()
    };

    if (listRow) {
      messageObj.interactive = {
        type: "list_reply",
        list_reply: { id: listRow.id, title: listRow.title }
      };
    } else if (buttonText) {
      messageObj.interactive = {
        type: "button_reply",
        button_reply: {
          id: buttonText.toLowerCase().replace(/\s+/g, "_"),
          title: buttonText
        }
      };
    } else {
      messageObj.text = { body: textToSend };
    }

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [messageObj]
              }
            }
          ]
        }
      ]
    };

    try {
      const res = await fetch(`${ADMIN_CONFIG_API_BASE_URL}/webhook/whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SheTrades-Source": "sandbox"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Webhook responded with status ${res.status}`);
      }

      const result = await res.json();

      if (result.status === "processed" && result.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: result.messageId ? `bot-${result.messageId}` : `bot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            sender: "bot",
            text: result.reply,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            buttons: result.buttons,
            list: result.list
          }
        ]);
      } else if (result.status === "duplicate") {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            sender: "system",
            text: `⚠️ Message ignored by backend because it's a duplicate ID. State: ${result.state}`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            sender: "system",
            text: `⚠️ Webhook payload was ignored/unprocessed by backend. Reason: ${result.reason || "N/A"}`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ]);
      }

      await fetchSessionDetails(phone.trim());
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          sender: "system",
          text: `❌ Error communicating with WhatsApp webhook endpoint: ${
            err instanceof Error ? err.message : String(err)
          }`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSession = async () => {
    setIsResetting(true);
    setFeedback(null);
    try {
      const resetToken = getStoredAdminConfigToken();
      const res = await fetch(`${ADMIN_CONFIG_API_BASE_URL}/webhook/whatsapp/reset`, {
        method: "POST",
        headers: resetToken ? { authorization: `Bearer ${resetToken}` } : {}
      });
      if (res.ok) {
        setSession(null);
        setMessages([
          {
            id: `reset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            sender: "system",
            text: "✅ Chatbot database sessions reset successfully. All phone memory states cleared on the backend.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ]);
        setInputText("Hello SheTrades");
        setFeedback({ type: "success", message: "Sandbox session states reset successfully." });
      } else {
        throw new Error(`Reset failed with status ${res.status}`);
      }
    } catch (err) {
      console.error(err);
      setFeedback({
        type: "error",
        message: `Failed to reset session states: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <section className="whatsapp-sandbox-section">
      <div className="whatsapp-sandbox-section-header">
        <h4 className="whatsapp-sandbox-section-title">Whatsapp Sandbox</h4>
        <p className="whatsapp-sandbox-section-desc">
          Simulate real WhatsApp interactions using your live dynamic content and dialogue configurations.
        </p>
      </div>
      <div className="whatsapp-sandbox-grid">
        {/* Smartphone Mockup */}
        <div className="whatsapp-phone-mockup">
          <div className="whatsapp-phone-bezel">
            {/* Speaker & Camera notch */}
            <div className="phone-notch"></div>

            {/* Chat Screen */}
            <div className="whatsapp-phone-screen">
              {/* Phone Header */}
              <div className="whatsapp-phone-header">
                <div className="phone-header-left">
                  <div className="bot-avatar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <circle cx="12" cy="5" r="2" />
                      <path d="M12 7v4" />
                      <line x1="8" y1="16" x2="8" y2="16.01" />
                      <line x1="16" y1="16" x2="16" y2="16.01" />
                    </svg>
                  </div>
                  <div>
                    <h5 className="bot-name">SheTrades Assistant</h5>
                    <span className="bot-status">
                      <span className="pulse-dot"></span>
                      Active Sandbox Session
                    </span>
                  </div>
                </div>
              </div>

              {/* Chat Message Logs */}
              <div className="whatsapp-phone-chatbox">
                {messages.map((msg) => (
                  <div key={msg.id} className={`chat-message-row chat-message-row--${msg.sender}`}>
                    {msg.sender === "system" ? (
                      <div className="chat-bubble chat-bubble--system">{msg.text}</div>
                    ) : (
                      <div className={`chat-bubble chat-bubble--${msg.sender}`}>
                        <div className="chat-bubble-text">{msg.text}</div>
                        <div className="chat-bubble-time">{msg.timestamp}</div>
                        {msg.sender === "bot" && msg.buttons && msg.buttons.length > 0 && (
                          <div className="chat-bubble-buttons-container">
                            {msg.buttons.map((btn, idx) => (
                              <button
                                key={idx}
                                type="button"
                                disabled={isLoading}
                                onClick={() => void handleSend(undefined, btn)}
                                className="chat-bubble-button"
                              >
                                {btn}
                              </button>
                            ))}
                          </div>
                        )}
                        {msg.sender === "bot" && msg.list && msg.list.sections.length > 0 && (
                          <div className="chat-bubble-buttons-container">
                            {msg.list.sections.map((section, sIdx) => (
                              <div key={sIdx}>
                                {section.title ? (
                                  <div className="chat-bubble-list-section-title">{section.title}</div>
                                ) : null}
                                {section.rows.map((row) => (
                                  <button
                                    key={row.id}
                                    type="button"
                                    disabled={isLoading}
                                    onClick={() => void handleSend(undefined, row.title, row)}
                                    className="chat-bubble-button"
                                  >
                                    {row.title}
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Footer */}
              <form onSubmit={handleSend} className="whatsapp-phone-input-bar">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type a message..."
                  disabled={isLoading}
                  className="whatsapp-phone-input"
                />
                <button type="submit" disabled={!inputText.trim() || isLoading} className="whatsapp-send-button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Diagnostics Inspector */}
        <div className="sandbox-diagnostics-panel">
          <div className="diagnostics-header">
            <h4 className="diagnostics-title">Active Session Diagnostics</h4>
            <p className="diagnostics-desc">
              Inspect raw user state values saved in the backend runtime chatbot database.
            </p>
          </div>

          {feedback ? (
            <div className="diagnostics-feedback">
              <Badge variant={feedback.type === "success" ? "success" : "danger"}>{feedback.message}</Badge>
            </div>
          ) : null}

          <div className="diagnostics-card">
            <table className="diagnostics-table">
              <tbody>
                <tr>
                  <td>Simulated Phone</td>
                  <td>
                    <input
                      type="text"
                      className="phone-editor-input"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +234800000000"
                    />
                    <small className="phone-input-hint">Edit to simulate different phone numbers</small>
                  </td>
                </tr>
                <tr>
                  <td>Session Status</td>
                  <td>
                    {isFetchingSession ? (
                      <span className="status-fetch-indicator animate-pulse">Checking...</span>
                    ) : session ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="neutral">Uninitialized (Onboarding)</Badge>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Dialogue State</td>
                  <td>
                    <code className="state-badge-code">{session?.displayState || session?.state || "awaiting_name (Default)"}</code>
                  </td>
                </tr>
                <tr>
                  <td>Registered Name</td>
                  <td>
                    <span className="state-value-text">{session?.name || "n/a"}</span>
                  </td>
                </tr>
                <tr>
                  <td>Selected Language</td>
                  <td>
                    {session?.language ? (
                      <Badge variant="info">{session.language.toUpperCase()}</Badge>
                    ) : (
                      <span className="state-value-text">n/a</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>State / Location</td>
                  <td>
                    <span className="state-value-text">{session?.location ?? "-"}</span>
                  </td>
                </tr>
                {session?.lastUpdatedAt ? (
                  <tr>
                    <td>Last Synced</td>
                    <td>
                      <span className="state-value-text text-xs">
                        {new Date(session.lastUpdatedAt).toLocaleTimeString()}
                      </span>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="diagnostics-actions">
            <Button variant="danger" size="sm" loading={isResetting} onClick={handleResetSession}>
              Reset Session State
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={isFetchingSession}
              onClick={() => void fetchSessionDetails(phone.trim())}
            >
              Refresh Diagnostics
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
