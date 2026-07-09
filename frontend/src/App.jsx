import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function App() {
  // Form states
  const [recipient, setRecipient] = useState('');
  const [sender, setSender] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [emailType, setEmailType] = useState('Cold Outreach');
  const [customEmailType, setCustomEmailType] = useState('');
  const [tone, setTone] = useState('Professional');
  const [customTone, setCustomTone] = useState('');
  const [length, setLength] = useState('Medium');
  
  // Key points states
  const [keyPointInput, setKeyPointInput] = useState('');
  const [keyPoints, setKeyPoints] = useState([]);

  // UI/Request states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedSubject, setGeneratedSubject] = useState('');
  const [generatedBody, setGeneratedBody] = useState('');
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // API settings states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(localStorage.getItem('openai_api_key') || '');
  const [tempApiKey, setTempApiKey] = useState(localStorage.getItem('openai_api_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [serverKeyConfigured, setServerKeyConfigured] = useState(false);

  // Chatbot states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Hi there! I am your AI copywriting assistant. Ask me to brainstorm subject lines, refine details, or adjust the tone of your emails!' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatTyping, setIsChatTyping] = useState(false);
  const chatEndRef = useRef(null);

  // Auto-scroll chat to the bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatTyping]);

  useEffect(() => {
    const checkServerHealth = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/health');
        if (res.data.serverKeyConfigured) {
          setServerKeyConfigured(true);
        }
      } catch (err) {
        console.error('Failed to check server health:', err);
      }
    };
    checkServerHealth();
  }, []);

  const getApiKeyStatus = () => {
    if (customApiKey && customApiKey.trim() !== '') {
      return 'custom';
    }
    if (serverKeyConfigured) {
      return 'server';
    }
    return 'demo';
  };

  const handleOpenSettings = () => {
    setTempApiKey(customApiKey);
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    const cleanKey = tempApiKey.trim();
    setCustomApiKey(cleanKey);
    if (cleanKey) {
      localStorage.setItem('openai_api_key', cleanKey);
    } else {
      localStorage.removeItem('openai_api_key');
    }
    setIsSettingsOpen(false);
  };

  const handleCloseSettings = () => {
    setTempApiKey(customApiKey);
    setIsSettingsOpen(false);
    setShowApiKey(false);
  };

  const handleClearSettings = () => {
    setTempApiKey('');
    setCustomApiKey('');
    localStorage.removeItem('openai_api_key');
    setIsSettingsOpen(false);
    setShowApiKey(false);
  };

  // Add a key point tag
  const handleAddKeyPoint = (e) => {
    e.preventDefault();
    const cleanInput = keyPointInput.trim();
    if (cleanInput && !keyPoints.includes(cleanInput)) {
      setKeyPoints([...keyPoints, cleanInput]);
      setKeyPointInput('');
    }
  };

  // Remove a key point tag
  const handleRemoveKeyPoint = (indexToRemove) => {
    setKeyPoints(keyPoints.filter((_, idx) => idx !== indexToRemove));
  };

  // Form submit to backend API (can also be triggered to regenerate)
  const handleGenerate = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (!purpose.trim()) {
      setError('Please provide the purpose or context of the email.');
      return;
    }

    setLoading(true);
    setError('');
    setGeneratedSubject('');
    setGeneratedBody('');
    setIsDemoMode(false);

    try {
      const payload = {
        recipient,
        sender,
        senderEmail,
        recipientEmail,
        tone: tone === 'Custom' ? customTone : tone,
        context: purpose,
        emailType: emailType === 'Custom' ? customEmailType : emailType,
        length,
        keyPoints,
      };

      const headers = {};
      if (customApiKey && customApiKey.trim() !== '') {
        headers['x-api-key'] = customApiKey.trim();
      }

      const response = await axios.post('http://localhost:5000/api/generate-email', payload, { headers });

      if (response.data.success) {
        setGeneratedSubject(response.data.subject || 'Generated Email');
        setGeneratedBody(response.data.body || response.data.rawContent);
        setIsDemoMode(!!response.data.isDemo);
      } else {
        setError('Failed to generate email. The server returned an unsuccessful response.');
      }
    } catch (err) {
      console.error('API Error:', err);
      const serverError = err.response?.data?.error;
      const detailError = err.response?.data?.details;
      setError(serverError ? `${serverError} ${detailError ? `(${detailError})` : ''}` : 'Failed to connect to the backend server. Make sure the server is running on port 5000.');
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard helper
  const handleCopy = async (text, type) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'subject') {
        setCopiedSubject(true);
        setTimeout(() => setCopiedSubject(false), 2000);
      } else {
        setCopiedBody(true);
        setTimeout(() => setCopiedBody(false), 2000);
      }
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  // Open default mail client with prefilled details
  const handleSend = () => {
    if (!generatedBody) return;
    const mailtoUrl = `mailto:${recipientEmail || ''}?subject=${encodeURIComponent(generatedSubject)}&body=${encodeURIComponent(generatedBody)}`;
    window.location.href = mailtoUrl;
  };

  // Reset form and generated states
  const handleClear = () => {
    setRecipient('');
    setSender('');
    setSenderEmail('');
    setRecipientEmail('');
    setPurpose('');
    setEmailType('Cold Outreach');
    setCustomEmailType('');
    setTone('Professional');
    setCustomTone('');
    setLength('Medium');
    setKeyPointInput('');
    setKeyPoints([]);
    setError('');
    setGeneratedSubject('');
    setGeneratedBody('');
    setIsDemoMode(false);
  };

  // Handle chatbot messaging
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = { role: 'user', content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMessage];
    
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsChatTyping(true);

    try {
      const headers = {};
      if (customApiKey && customApiKey.trim() !== '') {
        headers['x-api-key'] = customApiKey.trim();
      }

      const response = await axios.post('http://localhost:5000/api/chat', {
        messages: updatedMessages
      }, { headers });

      if (response.data.success) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: response.data.reply }]);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error communicating with the chat server. Make sure the backend is running!'
      }]);
    } finally {
      setIsChatTyping(false);
    }
  };

  // Predefined email types and tones
  const emailTypes = ['Cold Outreach', 'Follow-up', 'Meeting Request', 'Thank You', 'Newsletter', 'Pitch', 'Support/Help', 'Custom'];
  const tones = ['Professional', 'Casual', 'Friendly', 'Persuasive', 'Bold', 'Urgent', 'Custom'];
  const lengths = ['Short', 'Medium', 'Long'];

  return (
    <div className="app-container">
      {/* Background Twinkling Stars */}
      <div className="stars">
        <div className="star star-1"></div>
        <div className="star star-2"></div>
        <div className="star star-3"></div>
        <div className="star star-4"></div>
        <div className="star star-5"></div>
        <div className="star star-6"></div>
        <div className="star star-7"></div>
        <div className="star star-8"></div>
      </div>

      <header className="app-header">
        <div className="logo-icon">✉</div>
        <div className="brand-text">
          <h1>AI Email Generator</h1>
          <p className="subtitle">Instantly draft high-converting, professional emails using generative AI</p>
        </div>
        <div className="header-actions">
          {getApiKeyStatus() === 'demo' && (
            <div className="api-status-badge demo" title="No valid API key found. Using simulated responses.">
              <span className="badge-dot"></span>
              Demo Mode
            </div>
          )}
          {getApiKeyStatus() === 'server' && (
            <div className="api-status-badge server" title="Using the server-configured OpenAI API key.">
              <span className="badge-dot"></span>
              Server API Key Active
            </div>
          )}
          {getApiKeyStatus() === 'custom' && (
            <div className="api-status-badge custom" title="Using your custom OpenAI API key.">
              <span className="badge-dot"></span>
              Custom API Key Active
            </div>
          )}
          <button 
            type="button" 
            className="settings-toggle-btn"
            onClick={handleOpenSettings}
            title="Configure API Keys"
          >
            ⚙️ Settings
          </button>
        </div>
      </header>

      <main className="app-content">
        {/* Input Configuration Panel */}
        <section className="config-card">
          <h2 className="section-title">Configure Email</h2>
          <form onSubmit={handleGenerate} className="generator-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="sender">Sender Name</label>
                <input
                  id="sender"
                  type="text"
                  placeholder="Your Name (e.g. Tulasi)"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="senderEmail">Sender Email (Optional)</label>
                <input
                  id="senderEmail"
                  type="text"
                  placeholder="tulasi@company.com"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="recipient">Recipient Name</label>
                <input
                  id="recipient"
                  type="text"
                  placeholder="Recipient Name (e.g. Mahitha)"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="recipientEmail">Recipient Email (Optional)</label>
                <input
                  id="recipientEmail"
                  type="text"
                  placeholder="mahitha@client.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="emailType">Email Type</label>
                <select
                  id="emailType"
                  value={emailType}
                  onChange={(e) => setEmailType(e.target.value)}
                >
                  {emailTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                {emailType === 'Custom' && (
                  <input
                    type="text"
                    className="custom-input-field animated-fade-in"
                    placeholder="Enter custom email type..."
                    value={customEmailType}
                    onChange={(e) => setCustomEmailType(e.target.value)}
                    required
                  />
                )}
              </div>

              <div className="form-group">
                <label htmlFor="tone">Tone</label>
                <select
                  id="tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                >
                  {tones.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {tone === 'Custom' && (
                  <input
                    type="text"
                    className="custom-input-field animated-fade-in"
                    placeholder="Enter custom tone..."
                    value={customTone}
                    onChange={(e) => setCustomTone(e.target.value)}
                    required
                  />
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="length">Length</label>
              <div className="radio-group">
                {lengths.map((len) => (
                  <label
                    key={len}
                    className={`radio-label ${length === len ? 'active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="length"
                      value={len}
                      checked={length === len}
                      onChange={() => setLength(len)}
                    />
                    {len}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="purpose">Purpose / Context <span className="required-star">*</span></label>
              <textarea
                id="purpose"
                rows="4"
                placeholder="What is the context of this email? (e.g., Pitching our software services, following up on our meeting yesterday, asking for feedback)"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Key Points (Optional)</label>
              <div className="tag-input-wrapper">
                <input
                  type="text"
                  placeholder="Add a key point and press Enter or Click Add..."
                  value={keyPointInput}
                  onChange={(e) => setKeyPointInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddKeyPoint(e);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddKeyPoint}
                  className="add-tag-btn"
                >
                  Add
                </button>
              </div>
              
              {keyPoints.length > 0 && (
                <div className="tags-container">
                  {keyPoints.map((point, index) => (
                    <span key={index} className="point-tag">
                      {point}
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyPoint(index)}
                        className="remove-tag-btn"
                        title="Remove point"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions">
              <button
                type="submit"
                disabled={loading}
                className={`generate-btn ${loading ? 'loading' : ''}`}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Generating...
                  </>
                ) : (
                  'Generate Email'
                )}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="clear-btn"
              >
                Clear All
              </button>
            </div>
          </form>
        </section>

        {/* Results Panel */}
        <section className="results-card">
          <h2 className="section-title">Generated Output</h2>
          
          {!generatedSubject && !generatedBody && !loading && (
            <div className="empty-results-state">
              <div className="empty-icon">✉</div>
              <p>Configure details on the left and click <strong>Generate Email</strong> to see the results here.</p>
            </div>
          )}

          {loading && (
            <div className="empty-results-state loading-state">
              <div className="loading-pulsar"></div>
              <p>AI is writing your email, please wait...</p>
            </div>
          )}

          {(generatedSubject || generatedBody) && !loading && (
            <div className="output-container animated-fade-in">
              {isDemoMode && (
                <div className="demo-badge">
                  <span>⚠️ Running in Demo Mode (No API Key found). Showing a sample mock email.</span>
                </div>
              )}
              
              <div className="email-window-mockup">
                {/* Titlebar */}
                <div className="mockup-titlebar">
                  <div className="window-dots">
                    <span className="window-dot close"></span>
                    <span className="window-dot minimize"></span>
                    <span className="window-dot maximize"></span>
                  </div>
                  <span className="mockup-window-title">New Message - Draft Preview</span>
                </div>
                
                {/* Headers */}
                <div className="mockup-headers-section">
                  <div className="mockup-header-row">
                    <span className="mockup-header-label">From:</span>
                    <span className="mockup-header-value">
                      <span className="header-address-pill">
                        {sender || 'User'} {senderEmail ? `<${senderEmail}>` : `<${(sender || 'sender').toLowerCase().replace(/\s+/g, '')}@ai-email.local>`}
                      </span>
                    </span>
                  </div>
                  <div className="mockup-header-row">
                    <span className="mockup-header-label">To:</span>
                    <span className="mockup-header-value">
                      <span className="header-address-pill">
                        {recipient || 'Recipient'} {recipientEmail ? `<${recipientEmail}>` : `<${(recipient || 'recipient').toLowerCase().replace(/\s+/g, '')}@domain.local>`}
                      </span>
                    </span>
                  </div>
                  <div className="mockup-header-row">
                    <span className="mockup-header-label">Subject:</span>
                    <span className="mockup-header-value subject">{generatedSubject}</span>
                  </div>
                  <div className="mockup-header-row" style={{ marginTop: '4px' }}>
                    <span className="mockup-header-label">Metadata:</span>
                    <span className="mockup-header-value">
                      <span className={`tone-badge tone-${(tone === 'Custom' ? customTone : tone).toLowerCase().replace(/\s+/g, '')}`}>
                        🎭 {tone === 'Custom' ? customTone : tone} Tone
                      </span>
                      <span className="tone-badge" style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        📏 {length}
                      </span>
                      <span className="tone-badge" style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        📂 {emailType === 'Custom' ? customEmailType : emailType}
                      </span>
                    </span>
                  </div>
                </div>
                
                {/* Email Body Area */}
                <div className="mockup-body-section">
                  <pre className="mockup-email-content">
                    {generatedBody}
                  </pre>
                </div>
                
                {/* Actions Bar */}
                <div className="mockup-actions-bar">
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="regenerate-btn"
                    title="Generate another email with the same settings"
                    style={{ marginRight: 'auto' }}
                  >
                    🔄 Regenerate
                  </button>
                  <button
                    onClick={() => handleCopy(generatedSubject, 'subject')}
                    className={`copy-btn ${copiedSubject ? 'copied' : ''}`}
                  >
                    {copiedSubject ? '✓ Subject Copied!' : '📋 Copy Subject'}
                  </button>
                  <button
                    onClick={() => handleCopy(generatedBody, 'body')}
                    className={`copy-btn ${copiedBody ? 'copied' : ''}`}
                  >
                    {copiedBody ? '✓ Email Copied!' : '📋 Copy Email'}
                  </button>
                  <button
                    onClick={handleSend}
                    className="copy-btn"
                    style={{ backgroundColor: 'rgba(0, 245, 212, 0.15)', borderColor: 'rgba(0, 245, 212, 0.3)', color: '#00f5d4' }}
                    title="Send this email via your default email application"
                  >
                    ✉️ Send Email
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
      {/* Settings Modal */}
      <div className={`modal-overlay ${isSettingsOpen ? 'open' : ''}`} onClick={handleCloseSettings}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>API Settings</h2>
            <button className="modal-close-btn" onClick={handleCloseSettings}>&times;</button>
          </div>
          <form onSubmit={handleSaveSettings} className="modal-body">
            <p>
              By default, this application runs in <strong>Demo Mode</strong> with mock generated responses. To generate real emails using OpenAI or Google Gemini models, configure an API key below.
            </p>
            <div className="settings-input-group">
              <label htmlFor="modalApiKey">API Key (OpenAI / Gemini)</label>
              <div className="input-with-toggle">
                <input
                  id="modalApiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder={serverKeyConfigured ? "Using Server Key (configured...)" : "Enter sk-... or AQ-... API key"}
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                />
                {tempApiKey && (
                  <button
                    type="button"
                    className="visibility-toggle-btn"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? "Hide key" : "Show key"}
                  >
                    {showApiKey ? "👁️" : "👁️‍🗨️"}
                  </button>
                )}
              </div>
              <p style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-muted)' }}>
                Your key is stored locally in your browser cache and is only sent to the local server to authorize API requests.
              </p>
            </div>
            
            <div className="modal-footer">
              {customApiKey && (
                <button type="button" className="btn-secondary" style={{ marginRight: 'auto', color: 'var(--error)' }} onClick={handleClearSettings}>
                  Clear Key
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={handleCloseSettings}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save Settings
              </button>
            </div>
          </form>
        </div>
      </div>
      {/* Floating Chatbot Assistant */}
      <div className="chat-container">
        <div className={`chat-widget ${isChatOpen ? 'open' : ''}`}>
          <div className="chat-header">
            <div className="chat-header-info">
              <span className="chat-header-dot"></span>
              <span className="chat-header-title">AI Copywriter Assistant</span>
            </div>
            <button className="chat-close" onClick={() => setIsChatOpen(false)} title="Close Chat">
              ✕
            </button>
          </div>

          <div className="chat-messages">
            {chatMessages.map((msg, index) => (
              <div key={index} className={`chat-message ${msg.role}`}>
                {msg.content}
              </div>
            ))}
            {isChatTyping && (
              <div className="chat-typing">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendChatMessage} className="chat-input-area">
            <input
              type="text"
              placeholder="Ask for copy advice, subject lines..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isChatTyping}
            />
            <button type="submit" className="chat-send-btn" disabled={!chatInput.trim() || isChatTyping} title="Send Message">
              ➤
            </button>
          </form>
        </div>

        <button className="chat-toggle" onClick={() => setIsChatOpen(!isChatOpen)} title="Chat Assistant">
          {isChatOpen ? '✕' : '💬'}
        </button>
      </div>
    </div>
  );
}

export default App;
