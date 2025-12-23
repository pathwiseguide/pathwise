// DOM Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginFormElement = document.getElementById('loginFormElement');
const registerFormElement = document.getElementById('registerFormElement');
const showRegisterLink = document.getElementById('showRegister');
const showLoginLink = document.getElementById('showLogin');
const errorMessage = document.getElementById('errorMessage');
const registerErrorMessage = document.getElementById('registerErrorMessage');
const registerSuccessMessage = document.getElementById('registerSuccessMessage');

// Check if already logged in
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/auth/check', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.authenticated) {
            // Already logged in, redirect to main page
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Auth check error:', error);
        // Continue to show login page
    }
    
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Toggle between login and register forms
    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            showRegisterForm();
        });
    }
    
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            showLoginForm();
        });
    }
    
    // Login form submission
    if (loginFormElement) {
        loginFormElement.addEventListener('submit', handleLogin);
    }
    
    // Register form submission
    if (registerFormElement) {
        registerFormElement.addEventListener('submit', handleRegister);
    }
}

// Show register form
function showRegisterForm() {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    clearMessages();
}

// Show login form
function showLoginForm() {
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    clearMessages();
}

// Clear all messages
function clearMessages() {
    if (errorMessage) {
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
    }
    if (registerErrorMessage) {
        registerErrorMessage.style.display = 'none';
        registerErrorMessage.textContent = '';
    }
    if (registerSuccessMessage) {
        registerSuccessMessage.style.display = 'none';
        registerSuccessMessage.textContent = '';
    }
}

// Show error message
function showError(message, isRegister = false) {
    if (isRegister) {
        if (registerErrorMessage) {
            registerErrorMessage.textContent = message;
            registerErrorMessage.style.display = 'block';
        }
    } else {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.style.display = 'block';
        }
    }
}

// Show success message
function showSuccess(message) {
    if (registerSuccessMessage) {
        registerSuccessMessage.textContent = message;
        registerSuccessMessage.style.display = 'block';
    }
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    clearMessages();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Important: include cookies
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Login successful, redirect to main page
            window.location.href = '/';
        } else {
            showError(data.message || 'Login failed. Please check your credentials.');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('An error occurred during login. Please try again.');
    }
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault();
    clearMessages();
    
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const email = document.getElementById('regEmail').value.trim();
    
    if (!username || !password) {
        showError('Please enter both username and password', true);
        return;
    }
    
    if (username.length < 3) {
        showError('Username must be at least 3 characters long', true);
        return;
    }
    
    if (password.length < 6) {
        showError('Password must be at least 6 characters long', true);
        return;
    }
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Important: include cookies
            body: JSON.stringify({ username, password, email })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Registration successful, show success message and redirect
            showSuccess('Account created successfully! Redirecting...');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            showError(data.message || 'Registration failed. Please try again.', true);
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('An error occurred during registration. Please try again.', true);
    }
}
