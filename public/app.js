// API base URL
const API_BASE = '/api';

// State
let questions = [];
let currentResponse = {};
let currentPage = 1;
let totalPages = 1;

// DOM Elements
const questionnaireContainer = document.getElementById('questionnaire');
const loadingDiv = document.getElementById('loading');
const thankYouDiv = document.getElementById('thank-you');
const newResponseBtn = document.getElementById('newResponseBtn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadQuestions();
    setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
    newResponseBtn.addEventListener('click', startNewResponse);
}

// Load questions from API
async function loadQuestions() {
    try {
        // Add timeout for Render free tier (may take 30+ seconds on first request)
        loadingDiv.textContent = 'Loading questions... (This may take up to 30 seconds on first load)';
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
        
        const response = await fetch(`${API_BASE}/questions`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        questions = await response.json();
        
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
        if (error.name === 'AbortError') {
            loadingDiv.innerHTML = 'Request timed out. The server may be starting up (Render free tier takes ~30 seconds).<br><button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 5px; cursor: pointer;">Retry</button>';
        } else {
            loadingDiv.innerHTML = `Error loading questions: ${error.message}<br><button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 5px; cursor: pointer;">Retry</button>`;
        }
    }
}

// Render questionnaire
function renderQuestionnaire() {
    loadingDiv.style.display = 'none';
    questionnaireContainer.style.display = 'block';
    thankYouDiv.style.display = 'none';
    
    questionnaireContainer.innerHTML = '';
    
    // Calculate total pages from questions
    totalPages = Math.max(...questions.map(q => q.page || 1), 1);
    
    // Add page indicator
    const pageIndicator = document.createElement('div');
    pageIndicator.className = 'page-indicator';
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    questionnaireContainer.appendChild(pageIndicator);
    
    // Filter questions for current page
    const currentPageQuestions = questions.filter(q => (q.page || 1) === currentPage);
    
    // Create questions wrapper
    const questionsWrapper = document.createElement('div');
    questionsWrapper.className = 'questions-wrapper';
    
    currentPageQuestions.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';
        questionDiv.dataset.questionId = question.id;
        
        const label = document.createElement('label');
        label.textContent = question.text;
        if (question.required) {
            label.innerHTML += ' <span style="color: red;">*</span>';
        }
        questionDiv.appendChild(label);
        
        const input = createInputForQuestion(question);
        questionDiv.appendChild(input);
        
        questionsWrapper.appendChild(questionDiv);
    });
    
    questionnaireContainer.appendChild(questionsWrapper);
    
    // Restore saved values for current page
    restorePageValues();
    
    // Add navigation buttons
    const navButtons = document.createElement('div');
    navButtons.className = 'nav-buttons';
    
    // Previous button
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn-secondary';
        prevBtn.textContent = '← Previous';
        prevBtn.addEventListener('click', () => {
            saveCurrentPageValues();
            goToPage(currentPage - 1);
        });
        navButtons.appendChild(prevBtn);
    }
    
    // Next/Submit button
    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn-primary';
        nextBtn.textContent = 'Next →';
        nextBtn.addEventListener('click', () => validateAndNext());
        navButtons.appendChild(nextBtn);
    } else {
        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn-primary';
        submitBtn.textContent = 'Submit';
        submitBtn.addEventListener('click', submitResponse);
        navButtons.appendChild(submitBtn);
    }
    
    questionnaireContainer.appendChild(navButtons);
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
    currentPage = 1;
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
    // Save current page values before submitting
    saveCurrentPageValues();
    
    // Validate required fields
    const missingFields = questions.filter(q => {
        if (!q.required) return false;
        const value = currentResponse[q.id];
        return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    });
    
    if (missingFields.length > 0) {
        alert('Please fill in all required fields.');
        // Go to first page with missing field
        const firstMissingPage = questions.find(q => missingFields.includes(q))?.page || 1;
        currentPage = firstMissingPage;
        renderQuestionnaire();
        return;
    }
    
    // Prepare response data
    const responseData = {
        questions: questions,
        answers: currentResponse,
        submittedAt: new Date().toISOString()
    };
    
    try {
        const response = await fetch(`${API_BASE}/responses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(responseData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            questionnaireContainer.style.display = 'none';
            thankYouDiv.style.display = 'block';
        } else {
            alert('Error submitting response. Please try again.');
        }
    } catch (error) {
        console.error('Error submitting response:', error);
        alert('Error submitting response. Please try again.');
    }
}

