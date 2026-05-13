window.onerror = function(message, source, lineno, colno, error) {
    var errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.position = 'absolute';
    errorDiv.style.top = '0';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.background = 'white';
    errorDiv.textContent = 'Error: ' + message + ' at ' + lineno + ':' + colno + ' ' + (error ? error.stack : '');
    document.body.appendChild(errorDiv);
};
window.addEventListener('unhandledrejection', function(event) {
    var errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.position = 'absolute';
    errorDiv.style.top = '50px';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.background = 'white';
    errorDiv.textContent = 'Promise Error: ' + event.reason;
    document.body.appendChild(errorDiv);
});
