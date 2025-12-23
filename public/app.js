// API base URL
const API_BASE = '/api';

// State
let questions = [];
let currentResponse = {};
let currentPage = 1;
let totalPages = 1;

// DOM Elements (will be set after DOM loads)
let questionnaireContainer;
let loadingDiv;
let thankYouDiv;
let newResponseBtn;
let logoutBtn;
let userInfo;

// Chat interface elements
let chatMessages;
let chatInputArea;
let chatInput;
let chatSendBtn;

// Chat state
let currentQuestionIndex = 0;
let isWaitingForAnswer = false;
let isChatMode = false; // Whether we're in chat mode (after first response) or questionnaire mode
let conversationHistory = []; // Store conversation history for ChatGPT context
let savedUserResponses = null; // Store user's saved questionnaire responses for chat context

// Initialize DOM elements
function initializeDOMElements() {
    questionnaireContainer = document.getElementById('questionnaire'); // May not exist in new design
    loadingDiv = document.getElementById('loading');
    thankYouDiv = document.getElementById('thank-you');
    newResponseBtn = document.getElementById('newResponseBtn');
    logoutBtn = document.getElementById('logoutBtn');
    userInfo = document.getElementById('userInfo');
    
    chatMessages = document.getElementById('chatMessages');
    chatInputArea = document.getElementById('chatInputArea');
    chatInput = document.getElementById('chatInput');
    chatSendBtn = document.getElementById('chatSendBtn');
    
    // Debug: Check if elements are found
    console.log('DOM Elements initialized:', {
        chatMessages: !!chatMessages,
        chatInputArea: !!chatInputArea,
        chatInput: !!chatInput,
        chatSendBtn: !!chatSendBtn,
        loadingDiv: !!loadingDiv
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    checkAuthentication();
    setupEventListeners();
});

// Check payment status (server-based, account-specific)
async function hasPaymentAccess() {
    // Check server first (account-based) - requires authentication
    try {
        const response = await fetch('/api/payment/status', {
            credentials: 'include'
        });
        if (response.ok) {
            const data = await response.json();
            // Server response is authoritative
            if (data.hasPayment === true) {
                // Sync to localStorage for consistency
                localStorage.setItem('paymentCompleted', 'true');
                return true;
            } else {
                // Clear localStorage if server says no payment
                localStorage.removeItem('paymentCompleted');
                localStorage.removeItem('paymentPlan');
                localStorage.removeItem('paymentDate');
                return false;
            }
        } else if (response.status === 401) {
            // Not logged in - clear localStorage and return false
            localStorage.removeItem('paymentCompleted');
            localStorage.removeItem('paymentPlan');
            localStorage.removeItem('paymentDate');
            return false;
        }
    } catch (error) {
        console.error('Error checking payment status:', error);
        // If server check fails, don't trust localStorage - return false for account-based security
        return false;
    }
    
    return false;
}

// Check if user is authenticated and has payment access
async function checkAuthentication() {
    try {
        const response = await fetch('/api/auth/check', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (!data.authenticated) {
            // Redirect to login
            window.location.href = '/login.html';
            return;
        }

        // Check payment status after authentication
        const hasAccess = await hasPaymentAccess();
        if (!hasAccess) {
            // If on questionnaire page, show payment required message
            const paymentRequired = document.getElementById('paymentRequired');
            const questionnaireContainer = document.getElementById('questionnaireContainer');
            if (paymentRequired && questionnaireContainer) {
                paymentRequired.style.display = 'block';
                questionnaireContainer.style.display = 'none';
                return;
            }
            // Otherwise redirect to payment page
            window.location.href = '/payment';
            return;
        }

        // User is logged in and has payment access
        // userInfo removed from UI, but keep for potential future use
        
        // Make sure questionnaire container is visible
        const questionnaireContainerDiv = document.getElementById('questionnaireContainer');
        if (questionnaireContainerDiv) {
            questionnaireContainerDiv.style.display = 'block';
        }
        
        loadQuestions();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html';
    }
}

// Event Listeners
function setupEventListeners() {
    if (newResponseBtn) {
        newResponseBtn.addEventListener('click', startNewResponse);
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    } else {
        console.error('Logout button not found!');
    }
    
    // Chat interface event listeners
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', handleSendMessage);
    }
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
        
        // Auto-resize textarea
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }
}

// Handle logout
async function handleLogout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        // Always redirect to login, even if request fails
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        // Redirect anyway
        window.location.href = '/login.html';
    }
}

// Check if user has already submitted a response
async function checkIfHasResponse() {
    try {
        const response = await fetch(`${API_BASE}/my-responses`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const responses = await response.json();
            return responses && responses.length > 0;
        }
        return false;
    } catch (error) {
        console.error('Error checking responses:', error);
        return false;
    }
}

// Load questions from API (force load even if user has submitted)
async function loadQuestions(forceLoad = false) {
    try {
        // Check if user has already submitted a response (unless force loading)
        if (!forceLoad) {
            const hasResponse = await checkIfHasResponse();
            
            if (hasResponse) {
                // User has already submitted, show chat mode
                isChatMode = true;
                renderChatMode();
                return;
            }
        }
        
        // Show loading if it exists
        if (loadingDiv) {
            loadingDiv.style.display = 'block';
            loadingDiv.textContent = 'Loading questions... (This may take up to 30 seconds on first load)';
        }
        
        // Make sure questionnaire container is visible
        const questionnaireContainerDiv = document.getElementById('questionnaireContainer');
        if (questionnaireContainerDiv) {
            questionnaireContainerDiv.style.display = 'block';
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        console.log('Fetching questions from:', `${API_BASE}/questions`);
        const response = await fetch(`${API_BASE}/questions`, {
            signal: controller.signal,
            credentials: 'include' // Include session cookie
        });
        
        clearTimeout(timeoutId);
        
        console.log('Questions response status:', response.status);
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('Unauthorized - redirecting to login');
                window.location.href = '/login.html';
                return;
            }
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        
        questions = await response.json();
        console.log('Loaded questions:', questions.length);
        
        if (questions.length === 0) {
            // Initialize with sample questions if empty
            questions = [
                {
                    id: '1',
                    text: 'What is your name?',
                    type: 'text',
                    required: true,
                    page: 1
                },
                {
                    id: '2',
                    text: 'What is your email?',
                    type: 'email',
                    required: true,
                    page: 1
                },
                {
                    id: '3',
                    text: 'How would you rate your experience?',
                    type: 'radio',
                    options: ['Excellent', 'Good', 'Fair', 'Poor'],
                    required: true,
                    page: 2
                }
            ];
            await saveQuestionsToServer(questions);
        }
        
        // Calculate total pages
        totalPages = Math.max(...questions.map(q => q.page || 1), 1);
        currentPage = 1;
        
        renderQuestionnaire();
    } catch (error) {
        console.error('Error loading questions:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        
        // If it's a 401, redirect to login
        if (error.message && error.message.includes('401')) {
            if (loadingDiv) {
                loadingDiv.innerHTML = 'Authentication required. Redirecting to login...';
            }
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1000);
            return;
        }
        
        if (loadingDiv) {
            if (error.name === 'AbortError') {
                loadingDiv.innerHTML = 'Request timed out. The server may be starting up (Render free tier takes ~30 seconds).<br><br>Error: ' + error.message + '<br><button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 5px; cursor: pointer;">Retry</button>';
            } else if (error.message && error.message.includes('Failed to fetch')) {
                loadingDiv.innerHTML = 'Cannot connect to server. Please check:<br>1. Server is running<br>2. You are logged in<br>3. Network connection is working<br><br>Error: ' + error.message + '<br><button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 5px; cursor: pointer;">Retry</button>';
            } else {
                loadingDiv.innerHTML = `Error loading questions: ${error.message}<br><br>Check the browser console (F12) for more details.<br><button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 5px; cursor: pointer;">Retry</button>`;
            }
        }
    }
}

// Save questions to server
async function saveQuestionsToServer(questionsToSave) {
    try {
        const response = await fetch(`${API_BASE}/questions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(questionsToSave)
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            throw new Error('Failed to save questions');
        }
    } catch (error) {
        console.error('Error saving questions:', error);
        if (response && response.status === 401) {
            window.location.href = '/login.html';
        } else {
            throw error;
        }
    }
}

// Render questionnaire as chat interface
function renderQuestionnaire() {
    console.log('Rendering questionnaire as chat...', { questionsCount: questions.length });
    
    // Show the questionnaire container (which has the chat interface)
    const questionnaireContainerDiv = document.getElementById('questionnaireContainer');
    if (!questionnaireContainerDiv) {
        console.error('questionnaireContainer div not found!');
        return;
    }
    
    questionnaireContainerDiv.style.display = 'block';
    console.log('Questionnaire container shown');
    
    // Hide loading and thank you
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
    if (thankYouDiv) {
        thankYouDiv.style.display = 'none';
    }
    
    // Show the chat container
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
        chatContainer.style.display = 'flex';
    }
    
    // Re-initialize DOM elements in case they weren't found initially
    initializeDOMElements();
    
    // Check if chat elements exist
    if (!chatMessages) {
        console.error('chatMessages element not found!');
        if (loadingDiv) {
            loadingDiv.innerHTML = 'Error: Chat messages container not found. Please refresh the page.';
            loadingDiv.style.display = 'block';
        }
        return;
    }
    
    // Reset chat state
    currentQuestionIndex = 0;
    currentResponse = {};
    isWaitingForAnswer = false;
    
    // Clear chat messages
    chatMessages.innerHTML = '';
    
    // Hide input area initially
    if (chatInputArea) {
        chatInputArea.style.display = 'none';
    }
    
    // Show welcome message
    addBotMessage("Hello! I'm here to help you with a few questions. Let's get started!");
    
    // Start asking questions
    setTimeout(() => {
        if (questions.length === 0) {
            addBotMessage("No questions available. Please contact support.");
            return;
        }
        askNextQuestion();
    }, 1000);
}

// Format ChatGPT response text with proper formatting
function formatChatGPTResponse(text) {
    if (!text) return '';
    
    // Escape HTML first to prevent XSS
    let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Convert markdown-style formatting
    // Headers
    formatted = formatted.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    formatted = formatted.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    formatted = formatted.replace(/^# (.*$)/gim, '<h2>$1</h2>');
    
    // Bold text
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Numbered lists
    formatted = formatted.replace(/^\d+\.\s+(.*)$/gim, '<li>$1</li>');
    
    // Bullet points (various formats)
    formatted = formatted.replace(/^[-•]\s+(.*)$/gim, '<li>$1</li>');
    formatted = formatted.replace(/^[*]\s+(.*)$/gim, '<li>$1</li>');
    
    // Wrap consecutive list items in <ul>
    formatted = formatted.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
        return '<ul>' + match + '</ul>';
    });
    
    // Code blocks
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Line breaks (double newline = paragraph, single = line break)
    formatted = formatted.replace(/\n\n+/g, '</p><p>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Wrap in paragraph tags
    formatted = '<p>' + formatted + '</p>';
    
    // Clean up empty paragraphs
    formatted = formatted.replace(/<p><\/p>/g, '');
    formatted = formatted.replace(/<p><br><\/p>/g, '<br>');
    
    return formatted;
}

// Add a bot message to the chat
function addBotMessage(text, isFormatted = true) {
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-bot';
    
    if (isFormatted) {
        messageDiv.innerHTML = formatChatGPTResponse(text);
    } else {
        messageDiv.textContent = text;
    }
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
    
    // Save chat messages after adding
    if (isChatMode) {
        saveChatMessages();
    }
}

// Add a user message to the chat
function addUserMessage(text) {
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-user';
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
    
    // Save chat messages after adding
    if (isChatMode) {
        saveChatMessages();
    }
}

// Show typing indicator
function showTypingIndicator() {
    if (!chatMessages) return;
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message-typing';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
    chatMessages.appendChild(typingDiv);
    scrollToBottom();
}

// Remove typing indicator
function removeTypingIndicator() {
    const typing = document.getElementById('typing-indicator');
    if (typing) {
        typing.remove();
    }
}

// Scroll chat to bottom
function scrollToBottom() {
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Ask the next question
function askNextQuestion() {
    // Filter questions based on conditions
    const availableQuestions = filterQuestionsByConditions(questions, currentResponse);
    
    console.log('Asking next question:', { 
        currentIndex: currentQuestionIndex, 
        totalQuestions: questions.length,
        availableQuestions: availableQuestions.length 
    });
    
    if (currentQuestionIndex >= availableQuestions.length) {
        // All questions answered, submit
        console.log('All questions answered, submitting...');
        submitResponse();
        return;
    }
    
    const question = availableQuestions[currentQuestionIndex];
    if (!question) {
        console.error('Question not found at index:', currentQuestionIndex);
        return;
    }
    
    // Update the global questions array reference to use filtered questions for indexing
    // Store original index mapping
    const originalIndex = questions.findIndex(q => q.id === question.id);
    if (originalIndex !== -1) {
        // Find the position in the filtered array
        const filteredIndex = availableQuestions.findIndex(q => q.id === question.id);
        if (filteredIndex !== currentQuestionIndex) {
            // Adjust if needed - but we'll use the filtered array for display
        }
    }
    
    isWaitingForAnswer = true;
    
    // Show typing indicator
    showTypingIndicator();
    
    // Remove typing and show question after delay
    setTimeout(() => {
        removeTypingIndicator();
        
        // Show question as multiple bubbles if configured
        if (question.textBubbles && Array.isArray(question.textBubbles) && question.textBubbles.length > 0) {
            // Show multiple text bubbles
            question.textBubbles.forEach((bubble, index) => {
                setTimeout(() => {
                    addBotMessage(bubble);
                }, index * 300);
            });
            
            // Show ChatGPT prompt response before input if configured
            const totalBubbleDelay = question.textBubbles.length * 300;
            if (question.chatPrompt && question.chatPrompt.trim()) {
                // Get ChatGPT response before showing input
                setTimeout(() => {
                    getChatGPTResponseForQuestion(question, '').then(() => {
                        // Show input after ChatGPT response
                        showQuestionInput(question);
                    });
                }, totalBubbleDelay);
            } else {
                // Show input after all bubbles
                setTimeout(() => {
                    showQuestionInput(question);
                }, totalBubbleDelay);
            }
        } else {
            // Single bubble (default)
            addBotMessage(question.text + (question.required ? ' *' : ''));
            
            // Show ChatGPT prompt response before input if configured
            if (question.chatPrompt && question.chatPrompt.trim()) {
                // Get ChatGPT response before showing input
                getChatGPTResponseForQuestion(question, '').then(() => {
                    // Show input after ChatGPT response
                    showQuestionInput(question);
                });
            } else {
                showQuestionInput(question);
            }
        }
    }, 800);
}

// Filter questions based on conditions
function filterQuestionsByConditions(allQuestions, responses) {
    return allQuestions.filter(question => {
        // If no condition, always show
        if (!question.condition) {
            return true;
        }
        
        // Check condition
        const { questionId, operator, value } = question.condition;
        const answer = responses[questionId];
        
        if (answer === undefined || answer === null || answer === '') {
            return false;
        }
        
        switch (operator) {
            case 'equals':
                return answer === value || (Array.isArray(answer) && answer.includes(value));
            case 'notEquals':
                return answer !== value && (!Array.isArray(answer) || !answer.includes(value));
            case 'contains':
                if (Array.isArray(answer)) {
                    return answer.includes(value);
                }
                return String(answer).toLowerCase().includes(String(value).toLowerCase());
            case 'notContains':
                if (Array.isArray(answer)) {
                    return !answer.includes(value);
                }
                return !String(answer).toLowerCase().includes(String(value).toLowerCase());
            case 'greaterThan':
                return Number(answer) > Number(value);
            case 'lessThan':
                return Number(answer) < Number(value);
            default:
                return true;
        }
    });
}

// Show input for the current question
function showQuestionInput(question) {
    console.log('Showing input for question:', question);
    
    if (!chatInputArea) {
        console.error('chatInputArea not found!');
        return;
    }
    
    if (!chatInput) {
        console.error('chatInput not found!');
        return;
    }
    
    chatInputArea.style.display = 'block';
    if (chatInput) {
        chatInput.value = '';
        chatInput.focus();
    }
    
    // Clear any existing option buttons and submit buttons
    const existingOptions = chatInputArea.querySelector('.option-buttons');
    if (existingOptions) {
        existingOptions.remove();
    }
    const existingSubmit = chatInputArea.querySelector('.chat-send-btn[style*="margin-top"]');
    if (existingSubmit && existingSubmit !== chatSendBtn) {
        existingSubmit.remove();
    }
    
    // Handle different question types
    if (question.type === 'radio' || question.type === 'select') {
        if (chatInput) chatInput.style.display = 'none';
        if (chatSendBtn) chatSendBtn.style.display = 'none';
        
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'option-buttons';
        
        const options = question.type === 'radio' ? question.options : question.options;
        options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = option;
                btn.addEventListener('click', () => {
                // Remove selected class from all buttons
                optionsDiv.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                // Add selected class to clicked button
                btn.classList.add('selected');
                
                // Check if this is a post-college question
                const isPostCollegeQuestion = postCollegeQuestions.length > 0 && 
                    postCollegeQuestions.some(q => q.id === question.id);
                
                // Save answer
                if (isPostCollegeQuestion) {
                    if (!currentResponse.postCollegeAnswers) {
                        currentResponse.postCollegeAnswers = {};
                    }
                    currentResponse.postCollegeAnswers[question.id] = option;
                } else {
                    currentResponse[question.id] = option;
                }
                addUserMessage(option);
                
                // Note: ChatGPT prompt response is now shown BEFORE the input, not after
                // So we just move to next question
                if (isPostCollegeQuestion) {
                    setTimeout(() => {
                        currentPostCollegeQuestionIndex++;
                        chatInputArea.style.display = 'none';
                        askNextPostCollegeQuestion();
                    }, 500);
                } else {
                    setTimeout(() => {
                        currentQuestionIndex++;
                        chatInputArea.style.display = 'none';
                        askNextQuestion();
                    }, 500);
                }
            });
            optionsDiv.appendChild(btn);
        });
        
        chatInputArea.appendChild(optionsDiv);
        
    } else if (question.type === 'checkbox') {
        if (chatInput) chatInput.style.display = 'none';
        if (chatSendBtn) chatSendBtn.style.display = 'none';
        
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'option-buttons';
        
        const selectedOptions = [];
        question.options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = option;
            btn.addEventListener('click', () => {
                btn.classList.toggle('selected');
                
                if (btn.classList.contains('selected')) {
                    selectedOptions.push(option);
                } else {
                    const index = selectedOptions.indexOf(option);
                    if (index > -1) selectedOptions.splice(index, 1);
                }
            });
            optionsDiv.appendChild(btn);
        });
        
        // Add submit button for checkboxes
        const submitBtn = document.createElement('button');
        submitBtn.className = 'chat-send-btn';
        submitBtn.textContent = 'Continue';
        submitBtn.style.marginTop = '10px';
        submitBtn.addEventListener('click', () => {
            if (question.required && selectedOptions.length === 0) {
                addBotMessage('Please select at least one option.');
                return;
            }
            
            // Check if this is a post-college question
            const isPostCollegeQuestion = postCollegeQuestions.length > 0 && 
                postCollegeQuestions.some(q => q.id === question.id);
            
            if (isPostCollegeQuestion) {
                if (!currentResponse.postCollegeAnswers) {
                    currentResponse.postCollegeAnswers = {};
                }
                currentResponse.postCollegeAnswers[question.id] = selectedOptions;
            } else {
                currentResponse[question.id] = selectedOptions;
            }
            addUserMessage(selectedOptions.join(', '));
            
            // Note: ChatGPT prompt response is now shown BEFORE the input, not after
            // So we just move to next question
            if (isPostCollegeQuestion) {
                setTimeout(() => {
                    currentPostCollegeQuestionIndex++;
                    chatInputArea.style.display = 'none';
                    askNextPostCollegeQuestion();
                }, 500);
            } else {
                setTimeout(() => {
                    currentQuestionIndex++;
                    chatInputArea.style.display = 'none';
                    askNextQuestion();
                }, 500);
            }
        });
        
        chatInputArea.appendChild(optionsDiv);
        chatInputArea.appendChild(submitBtn);
        
    } else {
        // Text, email, number, textarea
        if (chatInput) {
            chatInput.style.display = 'block';
            chatInput.placeholder = question.type === 'email' ? 'Enter your email...' : 
                                    question.type === 'number' ? 'Enter a number...' : 
                                    'Type your answer...';
            
            // For textarea, adjust height
            if (question.type === 'textarea') {
                chatInput.style.minHeight = '80px';
                if (chatInput.tagName === 'TEXTAREA') {
                    chatInput.rows = 3;
                }
            } else {
                chatInput.style.minHeight = '44px';
                if (chatInput.tagName === 'TEXTAREA') {
                    chatInput.rows = 1;
                }
                // For input elements, set type
                if (chatInput.tagName === 'INPUT') {
                    chatInput.type = question.type === 'email' ? 'email' : question.type === 'number' ? 'number' : 'text';
                }
            }
        }
        
        if (chatSendBtn) {
            chatSendBtn.style.display = 'block';
        }
    }
}

// Check if message is a skip command
// Returns { questionNumber: number, type: 'post-college' | 'regular' | null }
function isSkipCommand(message) {
    const trimmed = message.trim();
    
    // Check for explicit type without number (defaults to question 1)
    if (/^(?:skip|go|jump|goto|navigate)\s+(?:to\s+)?(?:post[-\s]?college)(?:\s+question)?\s*$/i.test(trimmed)) {
        return { questionNumber: 1, type: 'post-college' };
    }
    if (/^(?:skip|go|jump|goto|navigate)\s+(?:to\s+)?(?:regular)(?:\s+question)?\s*$/i.test(trimmed)) {
        return { questionNumber: 1, type: 'regular' };
    }
    
    // Check for explicit type specification with number
    const postCollegePattern = /(?:skip|go|jump|goto|navigate)\s+(?:to\s+)?(?:post[-\s]?college\s+)?(?:question\s*)?(\d+)/i;
    const regularPattern = /(?:skip|go|jump|goto|navigate)\s+(?:to\s+)?(?:regular\s+)?(?:question\s*)?(\d+)/i;
    
    // Check for explicit post-college
    if (/post[-\s]?college/i.test(trimmed)) {
        const match = trimmed.match(postCollegePattern);
        if (match) {
            return { questionNumber: parseInt(match[1]), type: 'post-college' };
        }
    }
    
    // Check for explicit regular
    if (/regular/i.test(trimmed)) {
        const match = trimmed.match(regularPattern);
        if (match) {
            return { questionNumber: parseInt(match[1]), type: 'regular' };
        }
    }
    
    // Default pattern (no type specified)
    const skipPattern = /(?:skip|go|jump|goto|navigate)\s+(?:to\s+)?(?:question\s*)?(\d+)/i;
    const match = trimmed.match(skipPattern);
    if (match) {
        const questionNum = parseInt(match[1]);
        return { questionNumber: questionNum, type: null }; // null means auto-detect
    }
    return null;
}

// Check if message is a "go back" command
// Returns { questionNumber: number, type: 'post-college' | 'regular' | null }
function isGoBackCommand(message) {
    // Match patterns like:
    // "go back to question 25"
    // "go back to 25"
    // "back to question 25"
    // "back to 25"
    // "restart question 25"
    // "reset question 25"
    // "return to question 25"
    // "goto question 25" (for going back)
    // "goto 25"
    // "goto post-college question 25" or "goto post college question 25" (explicit post-college)
    // "goto regular question 25" (explicit regular)
    // "goto post-college" (goes to first post-college question)
    // "goto regular" (goes to first regular question)
    // Also handles trailing punctuation like "goto 25."
    const trimmed = message.trim();
    
    // Check for explicit type without number (defaults to question 1)
    if (/^(?:go\s+back|back|restart|reset|return|goto)\s+(?:to\s+)?(?:post[-\s]?college)(?:\s+question)?\s*$/i.test(trimmed)) {
        return { questionNumber: 1, type: 'post-college' };
    }
    if (/^(?:go\s+back|back|restart|reset|return|goto)\s+(?:to\s+)?(?:regular)(?:\s+question)?\s*$/i.test(trimmed)) {
        return { questionNumber: 1, type: 'regular' };
    }
    
    // Check for explicit type specification with number
    const postCollegePattern = /(?:go\s+back|back|restart|reset|return|goto)\s+(?:to\s+)?(?:post[-\s]?college\s+)?(?:question\s*)?(\d+)/i;
    const regularPattern = /(?:go\s+back|back|restart|reset|return|goto)\s+(?:to\s+)?(?:regular\s+)?(?:question\s*)?(\d+)/i;
    
    // Check for explicit post-college
    if (/post[-\s]?college/i.test(trimmed)) {
        const match = trimmed.match(postCollegePattern);
        if (match) {
            return { questionNumber: parseInt(match[1]), type: 'post-college' };
        }
    }
    
    // Check for explicit regular
    if (/regular/i.test(trimmed)) {
        const match = trimmed.match(regularPattern);
        if (match) {
            return { questionNumber: parseInt(match[1]), type: 'regular' };
        }
    }
    
    // Default pattern (no type specified)
    const goBackPattern = /(?:go\s+back|back|restart|reset|return|goto)\s+(?:to\s+)?(?:question\s*)?(\d+)/i;
    const match = trimmed.match(goBackPattern);
    if (match) {
        const questionNum = parseInt(match[1]);
        console.log('Go back command matched:', trimmed, '-> question', questionNum, '(type: auto-detect)');
        return { questionNumber: questionNum, type: null }; // null means auto-detect
    }
    return null;
}

// Handle go back to question (clears answers after that question)
function handleGoBackToQuestion(questionNumber) {
    // Convert to 0-based index (question numbers are 1-based)
    const targetIndex = questionNumber - 1;
    
    // Check if question number is valid
    if (targetIndex < 0 || targetIndex >= questions.length) {
        addBotMessage(`Question ${questionNumber} doesn't exist. There are ${questions.length} questions total.`);
        return false;
    }
    
    // Get all question IDs to find which ones to clear
    const questionIds = questions.map(q => q.id);
    const targetQuestionId = questionIds[targetIndex];
    
    // Clear all answers after the target question
    const answersToClear = [];
    for (let i = targetIndex + 1; i < questions.length; i++) {
        const qId = questions[i].id;
        if (currentResponse[qId] !== undefined) {
            answersToClear.push(questions[i].text);
            delete currentResponse[qId];
        }
    }
    
    // Check if the target question is available (not filtered out by conditions)
    const availableQuestions = filterQuestionsByConditions(questions, currentResponse);
    const targetQuestion = questions[targetIndex];
    const isAvailable = availableQuestions.some(q => q.id === targetQuestion.id);
    
    if (!isAvailable) {
        addBotMessage(`Question ${questionNumber} is not available based on your previous answers. Finding the next available question...`);
        // Find the next available question after the target
        let foundNext = false;
        for (let i = targetIndex; i < questions.length; i++) {
            const q = questions[i];
            if (availableQuestions.some(aq => aq.id === q.id)) {
                const filteredIndex = availableQuestions.findIndex(aq => aq.id === q.id);
                currentQuestionIndex = filteredIndex;
                foundNext = true;
                break;
            }
        }
        if (!foundNext) {
            addBotMessage('No more questions available after that point.');
            return false;
        }
    } else {
        // Find the index in the filtered array
        const filteredIndex = availableQuestions.findIndex(q => q.id === targetQuestion.id);
        currentQuestionIndex = filteredIndex;
    }
    
    // Clear input
    chatInput.value = '';
    chatInputArea.style.display = 'none';
    
    if (answersToClear.length > 0) {
        addBotMessage(`Going back to question ${questionNumber}. Cleared answers for ${answersToClear.length} question(s) after question ${questionNumber}.`);
    } else {
        addBotMessage(`Going back to question ${questionNumber}.`);
    }
    
    // Ask the target question
    setTimeout(() => {
        askNextQuestion();
    }, 500);
    
    return true;
}

// Handle skip to question
function handleSkipToQuestion(questionNumber) {
    // Convert to 0-based index (question numbers are 1-based)
    const targetIndex = questionNumber - 1;
    
    // Check if question number is valid
    if (targetIndex < 0 || targetIndex >= questions.length) {
        addBotMessage(`Question ${questionNumber} doesn't exist. There are ${questions.length} questions total.`);
        return false;
    }
    
    // Check if the target question is available (not filtered out by conditions)
    const availableQuestions = filterQuestionsByConditions(questions, currentResponse);
    const targetQuestion = questions[targetIndex];
    const isAvailable = availableQuestions.some(q => q.id === targetQuestion.id);
    
    if (!isAvailable) {
        addBotMessage(`Question ${questionNumber} is not available based on your previous answers. Skipping to the next available question after ${questionNumber}...`);
        // Find the next available question after the target
        let foundNext = false;
        for (let i = targetIndex; i < questions.length; i++) {
            const q = questions[i];
            if (availableQuestions.some(aq => aq.id === q.id)) {
                // Find its index in the filtered array
                const filteredIndex = availableQuestions.findIndex(aq => aq.id === q.id);
                currentQuestionIndex = filteredIndex;
                foundNext = true;
                break;
            }
        }
        if (!foundNext) {
            addBotMessage('No more questions available after that point.');
            return false;
        }
    } else {
        // Find the index in the filtered array
        const filteredIndex = availableQuestions.findIndex(q => q.id === targetQuestion.id);
        currentQuestionIndex = filteredIndex;
    }
    
    // Clear input
    chatInput.value = '';
    chatInputArea.style.display = 'none';
    
    addBotMessage(`Skipping to question ${questionNumber}...`);
    
    // Ask the target question
    setTimeout(() => {
        askNextQuestion();
    }, 500);
    
    return true;
}

// Handle send button click
async function handleSendMessage() {
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    // Check for commands first (works in any mode - questionnaire, post-college questions, or chat mode)
    const goBackCommand = isGoBackCommand(message);
    if (goBackCommand !== null) {
        const { questionNumber, type } = goBackCommand;
        console.log('Go back command detected:', questionNumber, 'type:', type || 'auto-detect', 'isChatMode:', isChatMode, 'questions.length:', questions.length, 'postCollegeQuestions.length:', postCollegeQuestions.length);
        
        // If type is explicitly specified, use that
        if (type === 'post-college') {
            // If post-college questions aren't loaded, try to load them first
            if (postCollegeQuestions.length === 0) {
                addBotMessage("Loading post-college questions...");
                try {
                    const loaded = await loadPostCollegeQuestions();
                    if (!loaded || postCollegeQuestions.length === 0) {
                        addBotMessage("No post-college questions are configured. Please contact support.");
                        chatInput.value = '';
                        return;
                    }
                } catch (error) {
                    console.error('Error loading post-college questions:', error);
                    addBotMessage("Error loading post-college questions. Please try again or contact support.");
                    chatInput.value = '';
                    return;
                }
            }
            
            // Now try to go back to the post-college question
            if (handleGoBackToPostCollegeQuestion(questionNumber)) {
                chatInput.value = '';
                return;
            } else {
                addBotMessage(`Post-college question ${questionNumber} doesn't exist. There are ${postCollegeQuestions.length} post-college questions available.`);
                chatInput.value = '';
                return;
            }
        } else if (type === 'regular') {
            if (questions.length > 0) {
                // Reset chat mode if we're in it
                if (isChatMode) {
                    isChatMode = false;
                }
                if (handleGoBackToQuestion(questionNumber)) {
                    return;
                }
            } else {
                // Try to force load questions
                addBotMessage("Loading questions...");
                try {
                    await loadQuestions(true); // Force load
                    if (questions.length > 0) {
                        isChatMode = false;
                        if (handleGoBackToQuestion(questionNumber)) {
                            chatInput.value = '';
                            return;
                        }
                    } else {
                        // Try one more time
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await loadQuestions(true);
                        if (questions.length > 0) {
                            isChatMode = false;
                            if (handleGoBackToQuestion(questionNumber)) {
                                chatInput.value = '';
                                return;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error loading questions:', error);
                }
                addBotMessage("No regular questions are loaded. Please try again or contact support.");
                chatInput.value = '';
                return;
            }
        } else {
            // Auto-detect: try post-college first, then regular
            let handled = false;
            
            // Try post-college questions first
            // If not loaded, try to load them
            if (postCollegeQuestions.length === 0) {
                addBotMessage(`Loading post-college questions...`);
                try {
                    const loaded = await loadPostCollegeQuestions();
                    // After loading, check if we have post-college questions now
                    if (loaded && postCollegeQuestions.length > 0) {
                        if (handleGoBackToPostCollegeQuestion(questionNumber)) {
                            handled = true;
                            return;
                        }
                    }
                } catch (error) {
                    console.error('Error loading post-college questions:', error);
                }
            } else {
                // Post-college questions are loaded, try to go back
                if (handleGoBackToPostCollegeQuestion(questionNumber)) {
                    handled = true;
                    return;
                }
            }
            
            // Always try regular questions if post-college didn't work or doesn't exist
            // If questions aren't loaded yet, try to load them first (force load)
            if (!handled) {
                if (questions.length === 0) {
                    // Questions not loaded, force load them (even if user has submitted)
                    addBotMessage(`Loading questions...`);
                    try {
                        await loadQuestions(true); // Force load
                        // After loading, try again
                        if (questions.length > 0) {
                            // Reset chat mode to allow navigation
                            isChatMode = false;
                            if (handleGoBackToQuestion(questionNumber)) {
                                handled = true;
                                return;
                            }
                        } else {
                            // Still no questions, try one more time with a delay
                            await new Promise(resolve => setTimeout(resolve, 500));
                            if (questions.length > 0) {
                                isChatMode = false;
                                if (handleGoBackToQuestion(questionNumber)) {
                                    handled = true;
                                    return;
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error loading questions:', error);
                        // Try one more time
                        try {
                            await loadQuestions(true);
                            if (questions.length > 0) {
                                isChatMode = false;
                                if (handleGoBackToQuestion(questionNumber)) {
                                    handled = true;
                                    return;
                                }
                            }
                        } catch (retryError) {
                            console.error('Retry error loading questions:', retryError);
                        }
                    }
                } else if (questions.length > 0) {
                    // Questions are loaded, but we might be in chat mode - reset it
                    if (isChatMode) {
                        isChatMode = false;
                    }
                    if (handleGoBackToQuestion(questionNumber)) {
                        handled = true;
                        return;
                    }
                }
            }
            
            // If neither worked, show error
            if (!handled) {
                if (postCollegeQuestions.length === 0 && questions.length === 0) {
                    addBotMessage(`No questions are loaded. Please start the questionnaire first.`);
                } else {
                    addBotMessage(`Question ${questionNumber} doesn't exist. ${postCollegeQuestions.length > 0 ? `Post-college questions: ${postCollegeQuestions.length} available. ` : ''}${questions.length > 0 ? `Regular questions: ${questions.length} available.` : ''}`);
                }
                chatInput.value = '';
                return;
            }
        }
    }
    
    // Check for skip command (works in any mode)
    const skipCommand = isSkipCommand(message);
    if (skipCommand !== null) {
        const { questionNumber, type } = skipCommand;
        console.log('Skip command detected:', questionNumber, 'type:', type || 'auto-detect', 'isChatMode:', isChatMode, 'questions.length:', questions.length, 'postCollegeQuestions.length:', postCollegeQuestions.length);
        
        // If type is explicitly specified, use that
        if (type === 'post-college') {
            // If post-college questions aren't loaded, try to load them first
            if (postCollegeQuestions.length === 0) {
                addBotMessage("Loading post-college questions...");
                try {
                    const loaded = await loadPostCollegeQuestions();
                    if (!loaded || postCollegeQuestions.length === 0) {
                        addBotMessage("No post-college questions are configured. Please contact support.");
                        chatInput.value = '';
                        return;
                    }
                } catch (error) {
                    console.error('Error loading post-college questions:', error);
                    addBotMessage("Error loading post-college questions. Please try again or contact support.");
                    chatInput.value = '';
                    return;
                }
            }
            
            // Now try to skip to the post-college question
            if (handleSkipToPostCollegeQuestion(questionNumber)) {
                chatInput.value = '';
                return;
            } else {
                addBotMessage(`Post-college question ${questionNumber} doesn't exist. There are ${postCollegeQuestions.length} post-college questions available.`);
                chatInput.value = '';
                return;
            }
        } else if (type === 'regular') {
            if (questions.length > 0) {
                // Reset chat mode if we're in it
                if (isChatMode) {
                    isChatMode = false;
                }
                if (handleSkipToQuestion(questionNumber)) {
                    return;
                }
            } else {
                // Try to force load questions
                addBotMessage("Loading questions...");
                try {
                    await loadQuestions(true); // Force load
                    if (questions.length > 0) {
                        isChatMode = false;
                        if (handleSkipToQuestion(questionNumber)) {
                            chatInput.value = '';
                            return;
                        }
                    } else {
                        // Try one more time
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await loadQuestions(true);
                        if (questions.length > 0) {
                            isChatMode = false;
                            if (handleSkipToQuestion(questionNumber)) {
                                chatInput.value = '';
                                return;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error loading questions:', error);
                }
                addBotMessage("No regular questions are loaded. Please try again or contact support.");
                chatInput.value = '';
                return;
            }
        } else {
            // Auto-detect: try post-college first, then regular
            let handled = false;
            
            // Try post-college questions first (only if they exist)
            if (postCollegeQuestions.length > 0) {
                if (handleSkipToPostCollegeQuestion(questionNumber)) {
                    handled = true;
                    return;
                }
            }
            
            // Always try regular questions if post-college didn't work or doesn't exist
            // If questions aren't loaded yet, try to load them first (force load)
            if (!handled) {
                if (questions.length === 0) {
                    // Questions not loaded, force load them (even if user has submitted)
                    addBotMessage(`Loading questions...`);
                    try {
                        await loadQuestions(true); // Force load
                        // After loading, try again
                        if (questions.length > 0) {
                            // Reset chat mode to allow navigation
                            isChatMode = false;
                            if (handleSkipToQuestion(questionNumber)) {
                                handled = true;
                                return;
                            }
                        } else {
                            // Still no questions, try one more time with a delay
                            await new Promise(resolve => setTimeout(resolve, 500));
                            await loadQuestions(true);
                            if (questions.length > 0) {
                                isChatMode = false;
                                if (handleSkipToQuestion(questionNumber)) {
                                    handled = true;
                                    return;
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error loading questions:', error);
                        // Try one more time
                        try {
                            await loadQuestions(true);
                            if (questions.length > 0) {
                                isChatMode = false;
                                if (handleSkipToQuestion(questionNumber)) {
                                    handled = true;
                                    return;
                                }
                            }
                        } catch (retryError) {
                            console.error('Retry error loading questions:', retryError);
                        }
                    }
                } else if (questions.length > 0) {
                    // Questions are loaded, but we might be in chat mode - reset it
                    if (isChatMode) {
                        isChatMode = false;
                    }
                    if (handleSkipToQuestion(questionNumber)) {
                        handled = true;
                        return;
                    }
                }
            }
            
            // If neither worked, show error
            if (!handled) {
                if (postCollegeQuestions.length === 0 && questions.length === 0) {
                    addBotMessage(`Unable to load questions. Please try refreshing the page or contact support.`);
                } else {
                    addBotMessage(`Question ${questionNumber} doesn't exist. ${postCollegeQuestions.length > 0 ? `Post-college questions: ${postCollegeQuestions.length} available. ` : ''}${questions.length > 0 ? `Regular questions: ${questions.length} available.` : ''}`);
                }
                chatInput.value = '';
                return;
            }
        }
    }
    
    // Check for help command
    if (/^help|commands|what can i do/i.test(message)) {
        let helpMessage = "Available commands:\n\n";
        
        if (postCollegeQuestions.length > 0 || questions.length > 0) {
            helpMessage += `Navigation commands:\n`;
            
            if (postCollegeQuestions.length > 0 && questions.length > 0) {
                helpMessage += `• "goto 25" - Auto-detects: tries post-college question 25 first, then regular question 25\n`;
                helpMessage += `• "goto post-college question 25" - Explicitly go to post-college question 25\n`;
                helpMessage += `• "goto regular question 25" - Explicitly go to regular question 25\n`;
            } else {
                helpMessage += `• "goto 25" or "go back to question 25" - Go to question 25\n`;
            }
            
            helpMessage += `• "back to 25" - Same as above (shorter)\n`;
            helpMessage += `• "restart question 25" - Go back and clear answers after question 25\n`;
            helpMessage += `• "skip to question 25" - Skip ahead without clearing answers\n\n`;
            
            if (postCollegeQuestions.length > 0 && questions.length > 0) {
                helpMessage += `Note: If both question types exist, commands without "post-college" or "regular" will try post-college first.\n\n`;
            }
        }
        
        if (!postCollegeQuestions.length && !questions.length) {
            helpMessage += "• Type any question to get help from your counselor\n";
        }
        
        helpMessage += "Note: These commands work in any mode (questionnaire, post-college questions, or chat mode).";
        
        addBotMessage(helpMessage);
        chatInput.value = '';
        return;
    }
    
    // Check if we're in chat mode (after first response) or questionnaire mode
    // Note: Commands are already handled above, so if we reach here, it's not a command
    if (isChatMode) {
        // Chat mode: send to ChatGPT
        sendChatMessage(message);
    } else if (postCollegeQuestions.length > 0 && currentPostCollegeQuestionIndex < postCollegeQuestions.length) {
        // Post-college question mode: handle post-college question answer
        const question = postCollegeQuestions[currentPostCollegeQuestionIndex];
        
        // Handle the answer (optional questions can be skipped with empty message)
        handlePostCollegeQuestionAnswer(question, message);
    } else {
        
        // Questionnaire mode: handle question answer
        if (!isWaitingForAnswer || currentQuestionIndex >= questions.length) return;
        
        const question = questions[currentQuestionIndex];
        
        if (question.required && !message) {
            addBotMessage('This question is required. Please provide an answer.');
            return;
        }
        
        if (message) {
            currentResponse[question.id] = message;
            addUserMessage(message);
            
            // Note: ChatGPT prompt response is now shown BEFORE the input, not after
            // So we don't need to call it here anymore
            
            // Clear input and hide input area
            chatInput.value = '';
            chatInputArea.style.display = 'none';
            
            // Move to next question
            setTimeout(() => {
                currentQuestionIndex++;
                askNextQuestion();
            }, 500);
        }
    }
}

// Save conversation history to localStorage
function saveConversationHistory() {
    try {
        const historyData = {
            messages: conversationHistory,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('pathwise_conversation_history', JSON.stringify(historyData));
    } catch (error) {
        console.error('Error saving conversation history:', error);
    }
}

// Load conversation history from localStorage
function loadConversationHistory() {
    try {
        const saved = localStorage.getItem('pathwise_conversation_history');
        if (saved) {
            const historyData = JSON.parse(saved);
            conversationHistory = historyData.messages || [];
            return true;
        }
    } catch (error) {
        console.error('Error loading conversation history:', error);
    }
    return false;
}

// Save chat messages to localStorage
function saveChatMessages() {
    try {
        if (!chatMessages) return;
        
        const messages = [];
        const messageElements = chatMessages.querySelectorAll('.message');
        messageElements.forEach(msg => {
            const isBot = msg.classList.contains('message-bot');
            const content = isBot ? msg.innerHTML : msg.textContent;
            messages.push({
                role: isBot ? 'assistant' : 'user',
                content: content,
                isFormatted: isBot
            });
        });
        
        localStorage.setItem('pathwise_chat_messages', JSON.stringify(messages));
    } catch (error) {
        console.error('Error saving chat messages:', error);
    }
}

// Load and restore chat messages from localStorage
function restoreChatMessages() {
    try {
        const saved = localStorage.getItem('pathwise_chat_messages');
        if (saved && chatMessages) {
            const messages = JSON.parse(saved);
            chatMessages.innerHTML = '';
            
            messages.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.className = `message message-${msg.role === 'assistant' ? 'bot' : 'user'}`;
                
                if (msg.isFormatted && msg.role === 'assistant') {
                    messageDiv.innerHTML = msg.content;
                } else {
                    messageDiv.textContent = msg.content;
                }
                
                chatMessages.appendChild(messageDiv);
            });
            
            scrollToBottom();
            return messages.length > 0;
        }
    } catch (error) {
        console.error('Error restoring chat messages:', error);
    }
    return false;
}

// Fetch user's saved responses for chat context
async function fetchUserResponses() {
    try {
        const response = await fetch(`${API_BASE}/my-responses`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const responses = await response.json();
            if (responses && responses.length > 0) {
                // Get the most recent response
                savedUserResponses = responses[0];
                return savedUserResponses;
            }
        }
    } catch (error) {
        console.error('Error fetching user responses:', error);
    }
    return null;
}

// Render chat mode (after first response)
async function renderChatMode() {
    console.log('Rendering chat mode...');
    
    const questionnaireContainerDiv = document.getElementById('questionnaireContainer');
    if (!questionnaireContainerDiv) {
        console.error('questionnaireContainer div not found!');
        return;
    }
    
    questionnaireContainerDiv.style.display = 'block';
    
    // Hide loading
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
    if (thankYouDiv) {
        thankYouDiv.style.display = 'none';
    }
    
    // Show the chat container
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
        chatContainer.style.display = 'flex';
    }
    
    // Re-initialize DOM elements
    initializeDOMElements();
    
    if (!chatMessages) {
        console.error('chatMessages element not found!');
        return;
    }
    
    // Fetch user's saved responses for context
    await fetchUserResponses();
    
    // Try to restore previous conversation
    const hasHistory = loadConversationHistory();
    const hasMessages = restoreChatMessages();
    
    // Only show welcome message if there's no previous conversation
    if (!hasMessages) {
        chatMessages.innerHTML = '';
        addBotMessage("Hello! I'm your Pathwise counselor. I've reviewed your previous responses. How can I help you today? Feel free to ask me any questions!");
    }
    
    // Show input area
    if (chatInputArea) {
        chatInputArea.style.display = 'block';
    }
    if (chatInput) {
        chatInput.value = '';
        chatInput.placeholder = 'Ask me anything...';
        chatInput.focus();
    }
}

// Get ChatGPT response for a specific question after it's answered
async function getChatGPTResponseForQuestion(question, answer) {
    if (!question.chatPrompt || !question.chatPrompt.trim()) {
        return;
    }
    
    showTypingIndicator();
    
    try {
        // Format the prompt with the answer (empty string if before answer)
        let formattedPrompt = question.chatPrompt.replace(/{answer}/g, answer || '');
        
        // If specific question answer is requested, use only that
        if (question.specificAnswerQuestionId) {
            // Check both regular answers and post-college answers
            const specificAnswer = currentResponse[question.specificAnswerQuestionId] || 
                                  (currentResponse.postCollegeAnswers && currentResponse.postCollegeAnswers[question.specificAnswerQuestionId]);
            if (specificAnswer !== undefined && specificAnswer !== null && specificAnswer !== '') {
                // Try to find question in regular or post-college questions
                let specificQ = questions.find(q => q.id === question.specificAnswerQuestionId);
                if (!specificQ && postCollegeQuestions.length > 0) {
                    specificQ = postCollegeQuestions.find(q => q.id === question.specificAnswerQuestionId);
                }
                const qText = specificQ ? specificQ.text : question.specificAnswerQuestionId;
                const answerText = Array.isArray(specificAnswer) ? specificAnswer.join(', ') : specificAnswer;
                formattedPrompt = formattedPrompt.replace(/{q:([^}]+)}/g, (match, qId) => {
                    if (qId === question.specificAnswerQuestionId) {
                        return answerText;
                    }
                    return match;
                });
                // Replace {allAnswers} with just the specific answer
                formattedPrompt = formattedPrompt.replace(/{allAnswers}/g, `${qText}: ${answerText}`);
            } else {
                // Specific answer not found, remove {allAnswers} and {q:...} placeholders
                formattedPrompt = formattedPrompt.replace(/{allAnswers}/g, '');
                formattedPrompt = formattedPrompt.replace(/{q:([^}]+)}/g, '');
            }
        } else {
            // Replace {q:questionId} with specific question answers (check both regular and post-college)
            formattedPrompt = formattedPrompt.replace(/{q:([^}]+)}/g, (match, qId) => {
                // Check both regular answers and post-college answers
                let specificAnswer = currentResponse[qId];
                if (specificAnswer === undefined && currentResponse.postCollegeAnswers) {
                    specificAnswer = currentResponse.postCollegeAnswers[qId];
                }
                if (specificAnswer !== undefined && specificAnswer !== null && specificAnswer !== '') {
                    const answerText = Array.isArray(specificAnswer) ? specificAnswer.join(', ') : specificAnswer;
                    return answerText;
                }
                return '';
            });
            
            // Replace {allAnswers} with all previous answers
            const allAnswersText = Object.entries(currentResponse)
                .filter(([key]) => key !== 'postCollegeAnswers')
                .map(([qId, ans]) => {
                    const q = questions.find(q => q.id === qId);
                    const qText = q ? q.text : qId;
                    const answerText = Array.isArray(ans) ? ans.join(', ') : ans;
                    return `${qText}: ${answerText}`;
                })
                .join('\n');
            
            formattedPrompt = formattedPrompt.replace(/{allAnswers}/g, allAnswersText);
        }
        
        // Send to ChatGPT with all previous answers
        const response = await fetch(`${API_BASE}/chat/question`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                questionId: question.id,
                questionText: question.text,
                answer: answer,
                allAnswers: currentResponse,
                prompt: formattedPrompt
            })
        });
        
        removeTypingIndicator();
        
        if (!response.ok) {
            console.error('Error getting ChatGPT response for question');
            return;
        }
        
        const data = await response.json();
        
        if (data.success && data.message) {
            // Add ChatGPT response as a separate bot message
            addBotMessage(data.message);
        }
    } catch (error) {
        console.error('Error getting ChatGPT response for question:', error);
        removeTypingIndicator();
    }
}

// Post-college questions state
let postCollegeQuestions = [];
let currentPostCollegeQuestionIndex = 0;

// Check if post-college questions are configured
async function checkForPostCollegeQuestions() {
    try {
        const response = await fetch(`${API_BASE}/post-college-messages`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        
        // Check for new format with questions array and finalMessage
        if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.questions)) {
            // New format with questions array
            return data.questions.length > 0;
        }
        
        // Check if it's array format (old or new)
        if (Array.isArray(data)) {
            if (data.length > 0 && data[0].type !== undefined) {
                // New format - questions array
                return data.length > 0;
            } else if (data.length > 0 && data[0].delay !== undefined) {
                // Old format - messages
                return data.length > 0;
            }
        }
        
        return false;
    } catch (error) {
        console.error('Error checking for post-college questions:', error);
        return false;
    }
}

// Load post-college questions (without displaying, just loading)
async function loadPostCollegeQuestions() {
    try {
        const response = await fetch(`${API_BASE}/post-college-messages`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        
        // Handle both old format (array of messages with text/delay) and new format (object with questions and finalMessage)
        if (data && typeof data === 'object' && Array.isArray(data.questions)) {
            // New format with questions and finalMessage
            postCollegeQuestions = data.questions || [];
            finalMessage = data.finalMessage || '';
            return postCollegeQuestions.length > 0;
        } else if (Array.isArray(data)) {
            // Check if it's old format (has text and delay) or new format (has type, text, etc.)
            if (data.length > 0 && data[0].text && data[0].delay !== undefined && !data[0].type) {
                // Old format - messages, not questions
                return false;
            } else {
                // New format - questions (array only, no finalMessage)
                postCollegeQuestions = data || [];
                finalMessage = '';
                return postCollegeQuestions.length > 0;
            }
        }
        
        return false;
    } catch (error) {
        console.error('Error loading post-college questions:', error);
        return false;
    }
}

// Load and display post-college questions
async function loadAndDisplayPostCollegeMessages() {
    try {
        const response = await fetch(`${API_BASE}/post-college-messages`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            console.log('No post-college questions configured');
            // Still show input area even if no questions configured
            showPostCollegeChatInput("Is there anything else you'd like to ask or discuss? Feel free to share your thoughts or questions!");
            return;
        }
        
        const data = await response.json();
        
        // Handle both old format (array of messages with text/delay) and new format (object with questions and finalMessage)
        if (data && typeof data === 'object' && Array.isArray(data.questions)) {
            // New format with questions and finalMessage
            postCollegeQuestions = data.questions || [];
            finalMessage = data.finalMessage || '';
            currentPostCollegeQuestionIndex = 0;
            
            if (postCollegeQuestions.length > 0) {
                // Start asking post-college questions
                askNextPostCollegeQuestion();
            } else {
                // No questions, show final message and transition to chat
                showFinalMessageAndTransitionToChat();
            }
        } else if (Array.isArray(data)) {
            // Check if it's old format (has text and delay) or new format (has type, text, etc.)
            if (data.length > 0 && data[0].text && data[0].delay !== undefined && !data[0].type) {
                // Old format - display as messages with delays
                let totalDelay = 0;
                data.forEach((message, index) => {
                    if (message.text && message.text.trim()) {
                        const delay = message.delay || 2000;
                        totalDelay += delay;
                        
                        setTimeout(() => {
                            addBotMessage(message.text);
                            conversationHistory.push({
                                role: 'assistant',
                                content: message.text
                            });
                        }, totalDelay - delay);
                    }
                });
                
                // After all messages, show final message and transition to chat
                setTimeout(() => {
                    showFinalMessageAndTransitionToChat();
                }, totalDelay);
            } else {
                // New format - questions (array only, no finalMessage)
                postCollegeQuestions = data || [];
                finalMessage = '';
                currentPostCollegeQuestionIndex = 0;
                
                if (postCollegeQuestions.length > 0) {
                    // Start asking post-college questions
                    askNextPostCollegeQuestion();
                } else {
                    // No questions, show final message and transition to chat
                    showFinalMessageAndTransitionToChat();
                }
            }
        } else if (data && typeof data === 'object' && Array.isArray(data.messages)) {
            // Legacy format with messages and promptMessage
            let totalDelay = 0;
            data.messages.forEach((message, index) => {
                if (message.text && message.text.trim()) {
                    const delay = message.delay || 2000;
                    totalDelay += delay;
                    
                    setTimeout(() => {
                        addBotMessage(message.text);
                        conversationHistory.push({
                            role: 'assistant',
                            content: message.text
                        });
                    }, totalDelay - delay);
                }
            });
            
            setTimeout(() => {
                showPostCollegeChatInput(data.promptMessage || "Is there anything else you'd like to ask or discuss? Feel free to share your thoughts or questions!");
            }, totalDelay);
        } else {
            // No questions configured, show final message and transition to chat
            showFinalMessageAndTransitionToChat();
        }
    } catch (error) {
        console.error('Error loading post-college questions:', error);
        // Show final message and transition to chat even on error
        showFinalMessageAndTransitionToChat();
    }
}

// Show final message and transition to chat mode
async function showFinalMessageAndTransitionToChat() {
    // Load final message if not already loaded
    if (!finalMessage) {
        try {
            const response = await fetch(`${API_BASE}/post-college-messages`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data && typeof data === 'object' && data.finalMessage) {
                    finalMessage = data.finalMessage;
                }
            }
        } catch (error) {
            console.error('Error loading final message:', error);
        }
    }
    
    // Show final message if configured
    if (finalMessage && finalMessage.trim()) {
        addBotMessage(finalMessage);
        conversationHistory.push({
            role: 'assistant',
            content: finalMessage
        });
        
        // Wait a bit before transitioning to chat mode
        setTimeout(() => {
            transitionToChatMode();
        }, 1000);
    } else {
        // No final message, transition directly to chat mode
        transitionToChatMode();
    }
}

// Transition to chat mode (direct ChatGPT access)
function transitionToChatMode() {
    // Ensure we're in chat mode
    isChatMode = true;
    
    // Show input area for direct ChatGPT chat
    if (chatInputArea) {
        chatInputArea.style.display = 'block';
    }
    
    if (chatInput) {
        chatInput.value = '';
        chatInput.placeholder = 'Ask me anything...';
        chatInput.style.display = 'block';
        chatInput.style.minHeight = '44px';
        if (chatInput.tagName === 'TEXTAREA') {
            chatInput.rows = 1;
        }
        chatInput.focus();
    }
    
    if (chatSendBtn) {
        chatSendBtn.style.display = 'block';
    }
    
    // Clear any existing option buttons
    if (chatInputArea) {
        const existingOptions = chatInputArea.querySelector('.option-buttons');
        if (existingOptions) {
            existingOptions.remove();
        }
    }
}

// Handle go back to post-college question (clears answers after that question)
function handleGoBackToPostCollegeQuestion(questionNumber) {
    // Convert to 0-based index (question numbers are 1-based)
    const targetIndex = questionNumber - 1;
    
    // Check if question number is valid
    if (targetIndex < 0 || targetIndex >= postCollegeQuestions.length) {
        addBotMessage(`Post-college question ${questionNumber} doesn't exist. There are ${postCollegeQuestions.length} post-college questions total.`);
        return false;
    }
    
    // Clear all answers after the target question
    const answersToClear = [];
    for (let i = targetIndex + 1; i < postCollegeQuestions.length; i++) {
        const qId = postCollegeQuestions[i].id;
        if (currentResponse.postCollegeAnswers && currentResponse.postCollegeAnswers[qId] !== undefined) {
            answersToClear.push(postCollegeQuestions[i].text || `Question ${i + 1}`);
            delete currentResponse.postCollegeAnswers[qId];
        }
    }
    
    // Set current index to target
    currentPostCollegeQuestionIndex = targetIndex;
    
    // Clear input
    chatInput.value = '';
    chatInputArea.style.display = 'none';
    
    if (answersToClear.length > 0) {
        addBotMessage(`Going back to post-college question ${questionNumber}. Cleared answers for ${answersToClear.length} question(s) after question ${questionNumber}.`);
    } else {
        addBotMessage(`Going back to post-college question ${questionNumber}.`);
    }
    
    // Ask the target question
    setTimeout(() => {
        askNextPostCollegeQuestion();
    }, 500);
    
    return true;
}

// Handle skip to post-college question
function handleSkipToPostCollegeQuestion(questionNumber) {
    // Convert to 0-based index (question numbers are 1-based)
    const targetIndex = questionNumber - 1;
    
    // Check if question number is valid
    if (targetIndex < 0 || targetIndex >= postCollegeQuestions.length) {
        addBotMessage(`Post-college question ${questionNumber} doesn't exist. There are ${postCollegeQuestions.length} post-college questions total.`);
        return false;
    }
    
    // Set current index to target
    currentPostCollegeQuestionIndex = targetIndex;
    
    // Clear input
    chatInput.value = '';
    chatInputArea.style.display = 'none';
    
    addBotMessage(`Skipping to post-college question ${questionNumber}...`);
    
    // Ask the target question
    setTimeout(() => {
        askNextPostCollegeQuestion();
    }, 500);
    
    return true;
}

// Ask next post-college question
function askNextPostCollegeQuestion() {
    if (currentPostCollegeQuestionIndex >= postCollegeQuestions.length) {
        // All questions answered, show final message if configured, then transition to chat mode
        showFinalMessageAndTransitionToChat();
        return;
    }
    
    const question = postCollegeQuestions[currentPostCollegeQuestionIndex];
    
    // Always show question text first (if it exists)
    if (question.text && question.text.trim()) {
        addBotMessage(question.text + (question.required ? ' *' : ''));
        conversationHistory.push({
            role: 'assistant',
            content: question.text
        });
    }
    
    // Display text bubbles if they exist (after question text)
    if (question.textBubbles && question.textBubbles.length > 0) {
        // Wait a bit after question text before showing bubbles
        const delayAfterQuestion = question.text && question.text.trim() ? 500 : 0;
        
        question.textBubbles.forEach((bubble, index) => {
            setTimeout(() => {
                addBotMessage(bubble);
                conversationHistory.push({
                    role: 'assistant',
                    content: bubble
                });
            }, delayAfterQuestion + index * 500);
        });
        
        // Check if no input is required
        if (question.noInput) {
            // Auto-advance after displaying all bubbles
            setTimeout(() => {
                // Get ChatGPT response if prompt is configured
                if (question.chatPrompt && question.chatPrompt.trim()) {
                    getChatGPTResponseForPostCollegeQuestion(question, '').then(() => {
                        // Move to next question after ChatGPT response
                        currentPostCollegeQuestionIndex++;
                        askNextPostCollegeQuestion();
                    });
                } else {
                    // Move to next question
                    currentPostCollegeQuestionIndex++;
                    askNextPostCollegeQuestion();
                }
            }, delayAfterQuestion + question.textBubbles.length * 500 + 1000);
        } else {
            // Show ChatGPT prompt response before input if configured
            const totalDelay = delayAfterQuestion + question.textBubbles.length * 500;
            if (question.chatPrompt && question.chatPrompt.trim()) {
                setTimeout(() => {
                    getChatGPTResponseForPostCollegeQuestion(question, '').then(() => {
                        // Show input after ChatGPT response
                        showQuestionInput(question);
                    });
                }, totalDelay);
            } else {
                setTimeout(() => {
                    showQuestionInput(question);
                }, totalDelay);
            }
        }
    } else {
        // No text bubbles, just show question text and input
        // Check if no input is required
        if (question.noInput) {
            // Auto-advance after displaying message
            setTimeout(() => {
                // Get ChatGPT response if prompt is configured
                if (question.chatPrompt && question.chatPrompt.trim()) {
                    getChatGPTResponseForPostCollegeQuestion(question, '').then(() => {
                        // Move to next question after ChatGPT response
                        currentPostCollegeQuestionIndex++;
                        askNextPostCollegeQuestion();
                    });
                } else {
                    // Move to next question
                    currentPostCollegeQuestionIndex++;
                    askNextPostCollegeQuestion();
                }
            }, 1000);
        } else {
            // Show ChatGPT prompt response before input if configured
            if (question.chatPrompt && question.chatPrompt.trim()) {
                setTimeout(() => {
                    getChatGPTResponseForPostCollegeQuestion(question, '').then(() => {
                        // Show input after ChatGPT response
                        showQuestionInput(question);
                    });
                }, 500);
            } else {
                setTimeout(() => {
                    showQuestionInput(question);
                }, 500);
            }
        }
    }
}

// Handle answer to post-college question
function handlePostCollegeQuestionAnswer(question, answer) {
    // Save answer (optional questions can be skipped with empty answer)
    if (answer && answer.trim()) {
        if (!currentResponse.postCollegeAnswers) {
            currentResponse.postCollegeAnswers = {};
        }
        currentResponse.postCollegeAnswers[question.id] = answer;
        addUserMessage(answer);
    } else if (!question.required) {
        // Optional question with no answer - skip it
        addUserMessage('(skipped)');
    } else {
        // Required question with no answer - don't proceed
        return;
    }
    
    // Clear input
    if (chatInput) chatInput.value = '';
    
    // Note: ChatGPT prompt response is now shown BEFORE the input, not after
    // So we just move to next question
    setTimeout(() => {
        currentPostCollegeQuestionIndex++;
        if (chatInputArea) chatInputArea.style.display = 'none';
        askNextPostCollegeQuestion();
    }, 500);
}

// Get ChatGPT response for post-college question
async function getChatGPTResponseForPostCollegeQuestion(question, answer) {
    if (!question.chatPrompt || !question.chatPrompt.trim()) {
        return Promise.resolve();
    }
    
    showTypingIndicator();
    
    try {
        // Format the prompt with the answer (empty string if before answer)
        let formattedPrompt = question.chatPrompt.replace(/{answer}/g, answer || '');
        
        // If specific question answer is requested, use only that
        if (question.specificAnswerQuestionId) {
            // Check both regular answers and post-college answers
            const specificAnswer = currentResponse[question.specificAnswerQuestionId] || 
                                  (currentResponse.postCollegeAnswers && currentResponse.postCollegeAnswers[question.specificAnswerQuestionId]);
            if (specificAnswer !== undefined && specificAnswer !== null && specificAnswer !== '') {
                // Try to find question in regular or post-college questions
                let specificQ = questions.find(q => q.id === question.specificAnswerQuestionId);
                if (!specificQ && postCollegeQuestions.length > 0) {
                    specificQ = postCollegeQuestions.find(q => q.id === question.specificAnswerQuestionId);
                }
                const qText = specificQ ? specificQ.text : question.specificAnswerQuestionId;
                const answerText = Array.isArray(specificAnswer) ? specificAnswer.join(', ') : specificAnswer;
                formattedPrompt = formattedPrompt.replace(/{q:([^}]+)}/g, (match, qId) => {
                    if (qId === question.specificAnswerQuestionId) {
                        return answerText;
                    }
                    return match;
                });
                // Replace {allAnswers} with just the specific answer
                formattedPrompt = formattedPrompt.replace(/{allAnswers}/g, `${qText}: ${answerText}`);
            } else {
                // Specific answer not found, remove {allAnswers} and {q:...} placeholders
                formattedPrompt = formattedPrompt.replace(/{allAnswers}/g, '');
                formattedPrompt = formattedPrompt.replace(/{q:([^}]+)}/g, '');
            }
        } else {
            // Replace {q:questionId} with specific question answers
            formattedPrompt = formattedPrompt.replace(/{q:([^}]+)}/g, (match, qId) => {
                // Check both regular answers and post-college answers
                let specificAnswer = currentResponse[qId];
                if (specificAnswer === undefined && currentResponse.postCollegeAnswers) {
                    specificAnswer = currentResponse.postCollegeAnswers[qId];
                }
                if (specificAnswer !== undefined && specificAnswer !== null && specificAnswer !== '') {
                    const answerText = Array.isArray(specificAnswer) ? specificAnswer.join(', ') : specificAnswer;
                    return answerText;
                }
                return '';
            });
            
            // Replace {allAnswers} with all previous answers (including questionnaire answers)
            const allAnswersText = Object.entries(currentResponse)
                .filter(([key]) => key !== 'postCollegeAnswers')
                .map(([qId, ans]) => {
                    const q = questions.find(q => q.id === qId);
                    const qText = q ? q.text : qId;
                    const answerText = Array.isArray(ans) ? ans.join(', ') : ans;
                    return `${qText}: ${answerText}`;
                })
                .join('\n');
            
            formattedPrompt = formattedPrompt.replace(/{allAnswers}/g, allAnswersText);
        }
        
        // Handle RAG if enabled (RAG is handled server-side)
        formattedPrompt = formattedPrompt.replace(/{ragResults}/g, '');
        
        // Send to ChatGPT (server will handle RAG if enabled)
        const response = await fetch(`${API_BASE}/chat/question`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                questionId: question.id,
                questionText: question.text,
                answer: answer,
                allAnswers: currentResponse,
                prompt: formattedPrompt,
                useRAG: question.useRAG || false,
                ragQuery: question.ragQuery || ''
            })
        });
        
        removeTypingIndicator();
        
        if (!response.ok) {
            console.error('Error getting ChatGPT response for post-college question');
            return Promise.resolve();
        }
        
        const data = await response.json();
        
        if (data.success && data.message) {
            // Add ChatGPT response as a separate bot message
            addBotMessage(data.message);
            conversationHistory.push({
                role: 'assistant',
                content: data.message
            });
        }
        
        return Promise.resolve();
    } catch (error) {
        console.error('Error getting ChatGPT response for post-college question:', error);
        removeTypingIndicator();
        return Promise.resolve();
    }
}

// Show chat input after college recommendations with a prompt
function showPostCollegeChatInput(promptMessage) {
    // Ensure we're in chat mode so messages are sent to ChatGPT
    isChatMode = true;
    
    // Use the provided prompt message or default
    const message = promptMessage || "Is there anything else you'd like to ask or discuss? Feel free to share your thoughts or questions!";
    
    // Add a prompt message asking if user wants to ask something
    addBotMessage(message);
    
    // Add to conversation history
    conversationHistory.push({
        role: 'assistant',
        content: message
    });
    
    // Show input area similar to question format
    if (chatInputArea) {
        chatInputArea.style.display = 'block';
    }
    
    if (chatInput) {
        chatInput.value = '';
        chatInput.placeholder = 'Ask me anything or share your thoughts...';
        chatInput.style.display = 'block';
        // Ensure input is visible and not hidden by any previous styling
        chatInput.style.minHeight = '44px';
        if (chatInput.tagName === 'TEXTAREA') {
            chatInput.rows = 1;
        }
        chatInput.focus();
    }
    
    if (chatSendBtn) {
        chatSendBtn.style.display = 'block';
    }
    
    // Clear any existing option buttons
    if (chatInputArea) {
        const existingOptions = chatInputArea.querySelector('.option-buttons');
        if (existingOptions) {
            existingOptions.remove();
        }
    }
}

// Get college recommendations automatically after submission
async function getCollegeRecommendations(responseData) {
    showTypingIndicator();
    
    try {
        // Send request to get college recommendations
        const response = await fetch(`${API_BASE}/chat/colleges`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                responseData: responseData
            })
        });
        
        removeTypingIndicator();
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            addBotMessage(`Sorry, I encountered an error getting college recommendations: ${errorData.message || 'Please try again later.'}`);
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Format the response as requested
            const formattedMessage = "Here are some colleges you might be interested in and why:\n\n" + data.message;
            addBotMessage(formattedMessage);
            
            // Add to conversation history
            conversationHistory.push({
                role: 'assistant',
                content: formattedMessage
            });
            
            // After college recommendations, show final message and transition to chat
            // (Post-college questions would have been shown before this if configured)
            setTimeout(() => {
                showFinalMessageAndTransitionToChat();
            }, 1000);
            
        } else {
            addBotMessage(`Sorry, I couldn't get college recommendations. ${data.message || 'Please try again.'}`);
        }
    } catch (error) {
        console.error('Error getting college recommendations:', error);
        removeTypingIndicator();
        addBotMessage('Sorry, I encountered a network error getting college recommendations. Please check your connection and try again.');
    }
}

// Send message to ChatGPT
async function sendChatMessage(message) {
    if (!message.trim()) return;
    
    // Add user message to chat
    addUserMessage(message);
    
    // Clear input
    chatInput.value = '';
    
    // Show typing indicator
    showTypingIndicator();
    
    // Add to conversation history
    conversationHistory.push({
        role: 'user',
        content: message
    });
    
    // Save conversation history
    saveConversationHistory();
    
    try {
        // Fetch user responses if not already loaded
        if (!savedUserResponses) {
            await fetchUserResponses();
        }
        
        // Send to ChatGPT API
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                message: message,
                conversationHistory: conversationHistory.slice(-10), // Keep last 10 messages for context
                userResponses: savedUserResponses || currentResponse // Include user's questionnaire responses for context
            })
        });
        
        removeTypingIndicator();
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            addBotMessage(`Sorry, I encountered an error: ${errorData.message || 'Please try again later.'}`);
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Add assistant response to chat
            addBotMessage(data.message);
            
            // Add to conversation history
            conversationHistory.push({
                role: 'assistant',
                content: data.message
            });
            
            // Keep conversation history manageable (last 20 messages)
            if (conversationHistory.length > 20) {
                conversationHistory = conversationHistory.slice(-20);
            }
            
            // Save conversation history
            saveConversationHistory();
        } else {
            addBotMessage(`Sorry, I couldn't process that. ${data.message || 'Please try again.'}`);
        }
    } catch (error) {
        console.error('Error sending chat message:', error);
        removeTypingIndicator();
        addBotMessage('Sorry, I encountered a network error. Please check your connection and try again.');
    }
}

// Restore saved values for current page
function restorePageValues() {
    const currentPageQuestions = questions.filter(q => (q.page || 1) === currentPage);
    
    currentPageQuestions.forEach(question => {
        const savedValue = currentResponse[question.id];
        if (savedValue !== undefined) {
            const input = document.getElementById(question.id);
            if (input) {
                if (question.type === 'checkbox') {
                    // Handle checkboxes
                    const checkboxes = document.querySelectorAll(`input[type="checkbox"][name="${question.id}"]`);
                    checkboxes.forEach(cb => {
                        if (Array.isArray(savedValue) && savedValue.includes(cb.value)) {
                            cb.checked = true;
                        }
                    });
                } else if (question.type === 'radio') {
                    // Handle radio buttons
                    const radios = document.querySelectorAll(`input[type="radio"][name="${question.id}"]`);
                    radios.forEach(radio => {
                        if (radio.value === savedValue) {
                            radio.checked = true;
                        }
                    });
                } else {
                    // Handle text inputs, textareas, selects
                    input.value = savedValue;
                }
            }
        }
    });
}

// Validate current page and move to next
function validateAndNext() {
    const currentPageQuestions = questions.filter(q => (q.page || 1) === currentPage);
    
    // Validate required fields on current page
    const missingFields = currentPageQuestions.filter(q => {
        if (!q.required) return false;
        const value = currentResponse[q.id];
        return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    });
    
    if (missingFields.length > 0) {
        alert('Please fill in all required fields on this page before continuing.');
        return;
    }
    
    goToPage(currentPage + 1);
}

// Navigate to a specific page
function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    
    // Save current page values
    saveCurrentPageValues();
    
    currentPage = page;
    renderQuestionnaire();
}

// Save values from current page inputs
function saveCurrentPageValues() {
    const currentPageQuestions = questions.filter(q => (q.page || 1) === currentPage);
    
    currentPageQuestions.forEach(question => {
        const input = document.getElementById(question.id);
        if (input) {
            if (question.type === 'checkbox') {
                const checkboxes = document.querySelectorAll(`input[type="checkbox"][name="${question.id}"]:checked`);
                const values = Array.from(checkboxes).map(cb => cb.value);
                currentResponse[question.id] = values;
            } else if (question.type === 'radio') {
                const radio = document.querySelector(`input[type="radio"][name="${question.id}"]:checked`);
                if (radio) {
                    currentResponse[question.id] = radio.value;
                }
            } else {
                currentResponse[question.id] = input.value;
            }
        }
    });
}

// Start new response
function startNewResponse() {
    currentResponse = {};
    currentQuestionIndex = 0;
    if (thankYouDiv) thankYouDiv.style.display = 'none';
    renderQuestionnaire();
}

// Create input element based on question type
function createInputForQuestion(question) {
    const container = document.createElement('div');
    
    switch (question.type) {
        case 'text':
        case 'email':
        case 'number':
            const input = document.createElement('input');
            input.type = question.type;
            input.id = question.id;
            input.required = question.required || false;
            input.addEventListener('input', (e) => {
                currentResponse[question.id] = e.target.value;
            });
            container.appendChild(input);
            break;
            
        case 'textarea':
            const textarea = document.createElement('textarea');
            textarea.id = question.id;
            textarea.required = question.required || false;
            textarea.addEventListener('input', (e) => {
                currentResponse[question.id] = e.target.value;
            });
            container.appendChild(textarea);
            break;
            
        case 'select':
            const select = document.createElement('select');
            select.id = question.id;
            select.required = question.required || false;
            if (!question.required) {
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = '-- Select an option --';
                select.appendChild(defaultOption);
            }
            question.options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option;
                optionEl.textContent = option;
                select.appendChild(optionEl);
            });
            select.addEventListener('change', (e) => {
                currentResponse[question.id] = e.target.value;
            });
            container.appendChild(select);
            break;
            
        case 'radio':
            const radioGroup = document.createElement('div');
            radioGroup.className = 'radio-group';
            question.options.forEach(option => {
                const radioOption = document.createElement('div');
                radioOption.className = 'radio-option';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = question.id;
                radio.value = option;
                radio.id = `${question.id}-${option}`;
                radio.required = question.required || false;
                radio.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        currentResponse[question.id] = e.target.value;
                    }
                });
                const label = document.createElement('label');
                label.htmlFor = radio.id;
                label.textContent = option;
                radioOption.appendChild(radio);
                radioOption.appendChild(label);
                radioGroup.appendChild(radioOption);
            });
            container.appendChild(radioGroup);
            break;
            
        case 'checkbox':
            const checkboxGroup = document.createElement('div');
            checkboxGroup.className = 'checkbox-group';
            question.options.forEach(option => {
                const checkboxOption = document.createElement('div');
                checkboxOption.className = 'checkbox-option';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.name = question.id;
                checkbox.value = option;
                checkbox.id = `${question.id}-${option}`;
                checkbox.addEventListener('change', (e) => {
                    if (!currentResponse[question.id]) {
                        currentResponse[question.id] = [];
                    }
                    if (e.target.checked) {
                        currentResponse[question.id].push(e.target.value);
                    } else {
                        currentResponse[question.id] = currentResponse[question.id].filter(v => v !== e.target.value);
                    }
                });
                const label = document.createElement('label');
                label.htmlFor = checkbox.id;
                label.textContent = option;
                checkboxOption.appendChild(checkbox);
                checkboxOption.appendChild(label);
                checkboxGroup.appendChild(checkboxOption);
            });
            container.appendChild(checkboxGroup);
            break;
            
        default:
            const defaultInput = document.createElement('input');
            defaultInput.type = 'text';
            defaultInput.id = question.id;
            defaultInput.required = question.required || false;
            defaultInput.addEventListener('input', (e) => {
                currentResponse[question.id] = e.target.value;
            });
            container.appendChild(defaultInput);
    }
    
    return container;
}

// Submit response
async function submitResponse() {
    // Validate required fields
    const missingFields = questions.filter(q => {
        if (!q.required) return false;
        const value = currentResponse[q.id];
        return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    });
    
    if (missingFields.length > 0) {
        addBotMessage('Please answer all required questions before submitting.');
        // Go back to first missing question
        const firstMissing = questions.findIndex(q => missingFields.includes(q));
        if (firstMissing !== -1) {
            currentQuestionIndex = firstMissing;
            askNextQuestion();
        }
        return;
    }
    
    // Hide input area
    if (chatInputArea) chatInputArea.style.display = 'none';
    
    // Show completion message
    showTypingIndicator();
    setTimeout(() => {
        removeTypingIndicator();
        addBotMessage('Thank you for your responses! Submitting now...');
        
        // Prepare response data
        const responseData = {
            questions: questions,
            answers: currentResponse,
            submittedAt: new Date().toISOString()
        };
        
        // Store responseData for later use
        const submittedResponseData = responseData;
        
        // Submit to server
        fetch(`${API_BASE}/responses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(responseData)
        })
        .then(response => response.json())
        .then(async (result) => {
            if (result.success) {
                setTimeout(() => {
                    addBotMessage('Your responses have been submitted successfully! 🎉');
                    setTimeout(async () => {
                        // Transition to chat mode instead of redirecting
                        isChatMode = true;
                        // Don't reset conversation history - keep existing if any
                        if (conversationHistory.length === 0) {
                            loadConversationHistory();
                        }
                        
                        // Clear chat - post-college questions will handle what comes next
                        if (chatMessages) {
                            chatMessages.innerHTML = '';
                        }
                        
                        // Check if there are post-college questions configured
                        // If yes, show those instead of automatically getting college recommendations
                        // If no, automatically get college recommendations as fallback
                        const hasPostCollegeQuestions = await checkForPostCollegeQuestions();
                        
                        if (hasPostCollegeQuestions) {
                            // Load and display post-college questions (user controls what happens)
                            loadAndDisplayPostCollegeMessages();
                        } else {
                            // No post-college questions configured, automatically get college recommendations as fallback
                            setTimeout(() => {
                                getCollegeRecommendations(submittedResponseData);
                            }, 500);
                        }
                        
                        // Show input area for chat
                        if (chatInputArea) {
                            chatInputArea.style.display = 'block';
                        }
                        if (chatInput) {
                            chatInput.value = '';
                            chatInput.placeholder = 'Ask me anything...';
                            chatInput.focus();
                        }
                    }, 1500);
                }, 500);
            } else {
                addBotMessage('There was an error submitting your responses. Please try again.');
                if (chatInputArea) chatInputArea.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error submitting response:', error);
            addBotMessage('There was an error submitting your responses. Please try again.');
            if (chatInputArea) chatInputArea.style.display = 'block';
        });
    }, 1000);
}

