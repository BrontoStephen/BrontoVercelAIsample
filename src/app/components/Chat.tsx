'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useChat } from '@ai-sdk/react';
import { useState, useRef, useEffect } from 'react';

export default function Chat() {
    // In this specific SDK version, useChat returns different helpers than standard V3
    const { messages, sendMessage, status } = useChat() as any;
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || status === 'submitted') return;

        const val = input;
        setInput('');

        try {
            await sendMessage({ text: val });
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    return (
        <div className="flex flex-col w-full max-w-2xl mx-auto h-[calc(100vh-120px)] mt-20">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 rounded-xl bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800">
                {messages.length === 0 && (
                    <div className="flex h-full items-center justify-center text-zinc-500">
                        Start a conversation...
                    </div>
                )}
                {messages.map((m: any) => (
                    <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${m.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-gray-200 dark:border-zinc-700'
                            }`}>
                            <div className="text-sm font-semibold mb-1 opacity-75">
                                {m.role === 'user' ? 'You' : 'AI'}
                            </div>
                            <div className="whitespace-pre-wrap">
                                {m.content || (m.parts && m.parts.map((p: any) => p.type === 'text' ? p.text : '').join('')) || (status === 'streaming' && m.role !== 'user' ? '...' : '')}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-4 bg-white dark:bg-transparent">
                <div className="relative">
                    <input
                        className="w-full p-4 pr-12 rounded-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 shadow-lg transition-all"
                        value={input}
                        placeholder="Type your message..."
                        onChange={handleInputChange}
                        disabled={status === 'submitted' || status === 'streaming'}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || status === 'submitted'}
                        className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                        </svg>
                    </button>
                </div>
            </form>
        </div>
    );
}
