import React, { useState, useRef, useEffect } from 'react'

const QUICK_REPLIES = [
  '如何开始质押？',
  '闪兑怎么用？',
  '如何提现？',
  '团队奖励规则'
]

const BOT_RESPONSES = {
  '如何开始质押？': '请先连接钱包，然后前往"质押"页面，输入推荐人地址完成注册，即可输入USDT金额进行投资质押。',
  '闪兑怎么用？': '在"闪兑"页面输入您要兑换的XMR数量，系统会自动计算可获得的USDT，确认后点击闪兑按钮即可。',
  '如何提现？': '在"资产"页面，您可以提取USDT余额，也可以请求XMR提现。XMR提现需要管理员审核处理。',
  '团队奖励规则': '团队奖励共12代，直推奖励10%，2代5%，3代3%，后续代递减。等级越高，享受的代数奖励越多。'
}

export default function ChatFAB() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'bot', text: '您好！我是 Monero Stake 助手，有什么可以帮您的吗？' }
  ])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = (text) => {
    const message = text || input.trim()
    if (!message) return

    setMessages((prev) => [...prev, { role: 'user', text: message }])
    setInput('')

    setTimeout(() => {
      const reply = BOT_RESPONSES[message] || '感谢您的提问！如需更多帮助，请联系官方客服。'
      setMessages((prev) => [...prev, { role: 'bot', text: reply }])
    }, 800)
  }

  const handleQuickReply = (text) => {
    handleSend(text)
  }

  return (
    <>
      <button
        className={`chat-fab ${isOpen ? 'chat-fab-hidden' : ''}`}
        onClick={() => setIsOpen(true)}
        aria-label="打开聊天"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M21 11.5C21 16.7467 16.7467 21 11.5 21C10.2675 21 9.09418 20.7388 8.03434 20.2661L3 21L3.73387 15.9657C3.26116 14.9058 3 13.7325 3 12.5C3 7.25329 7.25329 3 12.5 3C17.7467 3 21 6.25329 21 11.5Z"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="chat-fab-badge"></span>
      </button>

      {isOpen && (
        <div className="chat-panel">
          <div className="chat-panel-header">
            <div className="chat-header-info">
              <div className="chat-avatar">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L20 6V14C20 18 16 21 12 22C8 21 4 18 4 14V6L12 2Z"
                    stroke="#D4A72B"
                    strokeWidth="2"
                    fill="rgba(212,167,43,0.1)"
                  />
                </svg>
              </div>
              <div>
                <h4 className="chat-title">Monero Stake 助手</h4>
                <span className="chat-status">
                  <span className="status-dot"></span>
                  在线
                </span>
              </div>
            </div>
            <button className="chat-close" onClick={() => setIsOpen(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message chat-message-${msg.role}`}>
                <div className="chat-bubble">{msg.text}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 2 && (
            <div className="chat-quick-replies">
              {QUICK_REPLIES.map((reply) => (
                <button
                  key={reply}
                  className="quick-reply-btn"
                  onClick={() => handleQuickReply(reply)}
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder="输入消息..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button className="chat-send-btn" onClick={() => handleSend()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
