// Runs before the stylesheet so even the first loading-screen paint is themed.
const appearance = new URLSearchParams(location.search).get('appearance')
document.documentElement.dataset.appearance = appearance === 'light' ? 'light' : 'dark'
