import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './ChatWidget.css';

const ChatWidget = () => {
    const { currentUser } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { id: 1, text: "Hi! How can I help you today? I'm your EMS Assistant.", sender: 'bot' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { id: Date.now(), text: input, sender: 'user' };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.text,
                    user: currentUser
                })
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();

            const botMessage = {
                id: Date.now() + 1,
                text: data.answer || "I'm sorry, I couldn't process that.",
                sender: 'bot',
                sources: data.sources || []
            };

            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage = {
                id: Date.now() + 1,
                text: "Sorry, I'm having trouble connecting right now. Please try again later.",
                sender: 'bot',
                isError: true
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chat-widget-container">
            {/* Toggle Button */}
            {!isOpen && (
                <button
                    className="chat-toggle-btn"
                    onClick={() => setIsOpen(true)}
                    aria-label="Open Chat"
                >
                    <MessageCircle size={24} />
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className="chat-window shadow-lg border rounded-3 d-flex flex-column">
                    <div className="chat-header text-white p-3 d-flex justify-content-between align-items-center rounded-top">
                        <div className="d-flex align-items-center gap-2">
                            <Bot size={20} />
                            <h6 className="m-0">EMS Assistant</h6>
                        </div>
                        <button
                            className="btn btn-sm text-white p-0 border-0"
                            onClick={() => setIsOpen(false)}
                            aria-label="Close Chat"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="chat-messages flex-grow-1 p-3 overflow-auto bg-light">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`message-wrapper d-flex flex-column mb-3 ${msg.sender === 'user' ? 'align-items-end' : 'align-items-start'}`}
                            >
                                <div className={`message-bubble p-2 rounded ${msg.sender === 'user' ? 'text-white' : 'bg-white border'}`}>
                                    {msg.text.split('\n').map((line, i) => (
                                        <p key={i} className="mb-0" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                            {line}
                                        </p>
                                    ))}
                                </div>

                                {/* Sources Display */}
                                {msg.sources && msg.sources.length > 0 && (
                                    <div className="sources-container mt-1 bg-white border rounded p-2" style={{ maxWidth: '85%' }}>
                                        <small className="text-muted d-block mb-1">
                                            <FileText size={12} className="me-1" />
                                            Sources
                                        </small>
                                        <div className="d-flex flex-wrap gap-1">
                                            {msg.sources.map((src, i) => (
                                                <span key={i} className="badge bg-light text-dark border">
                                                    Enq: {src.id}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {isLoading && (
                            <div className="message-wrapper align-items-start mb-3">
                                <div className="message-bubble p-2 rounded bg-white border">
                                    <div className="typing-indicator d-flex gap-1 align-items-center">
                                        <div className="dot"></div>
                                        <div className="dot"></div>
                                        <div className="dot"></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="chat-input-area p-2 bg-white border-top rounded-bottom d-flex align-items-end gap-2">
                        <textarea
                            className="form-control"
                            rows="1"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message..."
                            style={{ resize: 'none', overflowY: 'hidden' }}
                        />
                        <button
                            className="btn d-flex align-items-center justify-content-center chat-send-btn"
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatWidget;
