// Login and Registration functionality

const loginForm = document.getElementById('loginFormElement');
const registerForm = document.getElementById('registerFormElement');
const showRegisterLink = document.getElementById('showRegister');
const showLoginLink = document.getElementById('showLogin');
const loginFormDiv = document.getElementById('loginForm');
const registerFormDiv = document.getElementById('registerForm');
const errorMessage = document.getElementById('errorMessage');
const registerErrorMessage = document.getElementById('registerErrorMessage');
const registerSuccessMessage = document.getElementById('registerSuccessMessage');

// Toggle between login and register forms
showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginFormDiv.style.display = 'none';
    registerFormDiv.style.display = 'block';
    clearMessages();
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerFormDiv.style.display = 'none';
    loginFormDiv.style.display = 'block';
    clearMessages();
});

function clearMessages() {
    errorMessage.style.display = 'none';
    registerErrorMessage.style.display = 'none';
    registerSuccessMessage.style.display = 'none';
}

// Handle login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Important for sessions
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Redirect to questionnaire
            window.location.href = '/';
        } else {
            errorMessage.textContent = data.message || 'Invalid username or password';
            errorMessage.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = 'An error occurred. Please try again.';
        errorMessage.style.display = 'block';
    }
});

// Handle registration
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const email = document.getElementById('regEmail').value;
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password, email })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            registerSuccessMessage.textContent = 'Account created successfully! Redirecting...';
            registerSuccessMessage.style.display = 'block';
            
            // Auto-login and redirect after registration
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            registerErrorMessage.textContent = data.message || 'Registration failed. Please try again.';
            registerErrorMessage.style.display = 'block';
        }
    } catch (error) {
        console.error('Registration error:', error);
        registerErrorMessage.textContent = 'An error occurred. Please try again.';
        registerErrorMessage.style.display = 'block';
    }
});

