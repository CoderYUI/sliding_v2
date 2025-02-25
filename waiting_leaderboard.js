import { TimeSync } from './timeSync.js';
import { realtimeDb } from './firebase-config.js';
import { ref, onValue } from 'firebase/database';

const timeSync = new TimeSync();

// Add this after existing imports
function setupResetListener() {
    const resetRef = ref(realtimeDb, 'systemState/reset');
    onValue(resetRef, (snapshot) => {
        const resetData = snapshot.val();
        if (resetData?.action === 'reset') {
            alert('System reset initiated. Thank you for participating!');
            window.location.replace('/thankyou.html');
        }
    });
}

// Theme switching functionality
const themeIcon = document.getElementById('theme-icon');
themeIcon.addEventListener('click', () => {
    const themeSwitch = themeIcon.parentElement;
    themeSwitch.classList.add('switching');
    document.body.classList.toggle('dark-theme');
    themeIcon.setAttribute('name', 
        document.body.classList.contains('dark-theme') ? 'sunny-outline' : 'moon-outline'
    );
    setTimeout(() => {
        themeSwitch.classList.remove('switching');
    }, 500);
});

// Carousel content with leaderboard-specific messages
const slides = [
    {
        image: '/images/quotes_images/20.png',
        text: 'Volunteering is a beautiful way to give back 🤝💙. By sharing our time, skills, and resources, we don’t just help others—we help build a brighter future for everyone 🌍✨.'
    },
    {
        image: '/images/quotes_images/11.png',
        text: 'Education is the most powerful weapon 📚✨—it transforms the world by leading us from darkness to light 🌍💡, shaping a brighter future for all.'
    },
    {
        image: '/images/quotes_images/15.png',
        text: 'Mental health struggles don’t define you 💙—they are experiences, not your identity. You may walk through the rain ☔, but you are stronger than the storm 🌈.'
    },
    {
        image: '/images/quotes_images/14.png',
        text: 'Diversity isn’t about our differences 🌍—it’s about celebrating each other’s uniqueness and growing stronger together 🤝❤️.'
    },
    {
        image: '/images/quotes_images/6.png',
        text: 'We do our best within our world’s limits 🌎, striving for justice ⚖️—the foundation of society, just as truth fuels every great idea 💡.'
    },
    {
        image: '/images/quotes_images/10.png',
        text: 'Women empowerment isn’t about overpowering men 🚫—it’s about embracing womanhood 👑 and lifting others up along the way 💪✨.'
    },
    {
        image: '/images/quotes_images/18.png',
        text: 'We are all connected 🌍💞, and lifting each other up creates a stronger, more resilient community. True success is helping everyone thrive 🤝✨.'
    },
    {
        image: '/images/quotes_images/16.png',
        text: 'Kindness and generosity 🤝❤️ create a compassionate world, easing suffering and building a community rooted in care and shared responsibility 🌍✨.'
    },
    {
        image: '/images/quotes_images/9.png',
        text: 'Diversity brings people together 🌍, but inclusion makes it work 🤝❤️. True unity comes from embracing differences and moving forward together!'
    },
    {
        image: '/images/quotes_images/22.png',
        text: 'Costumes and masks may change 🎭🎃, but our duty to society remains. Let’s embrace awareness, respect differences, and create an inclusive world—on Halloween and beyond 🤝✨.'
    }
];

// Initialize carousel
let currentSlide = 0;
const carousel = document.querySelector('.carousel');
const dotsContainer = document.querySelector('.dots-container');

// Create slides and dots
slides.forEach((slide, index) => {
    // Create slide
    const slideElement = document.createElement('div');
    slideElement.className = `slide ${index === 0 ? 'active' : ''}`;
    slideElement.innerHTML = `
        <img src="${slide.image}" alt="Trophy Image ${index + 1}" draggable="false">
        <p>${slide.text}</p>
    `;
    carousel.appendChild(slideElement);

    // Create dot
    const dot = document.createElement('div');
    dot.className = `dot ${index === 0 ? 'active' : ''}`;
    dot.addEventListener('click', () => goToSlide(index));
    dotsContainer.appendChild(dot);
});

// Enhanced navigation functions
function updateSlides() {
    document.querySelectorAll('.slide').forEach((slide, index) => {
        if (index === currentSlide) {
            slide.className = 'slide active';
        } else if (index < currentSlide || (currentSlide === 0 && index === slides.length - 1)) {
            slide.className = 'slide prev';
        } else {
            slide.className = 'slide';
        }
    });
    
    document.querySelectorAll('.dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
    });
}

// Add touch support for mobile
let touchStartX = 0;
let touchEndX = 0;

carousel.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

carousel.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, { passive: true });

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            nextSlide();
        } else {
            prevSlide();
        }
    }
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    updateSlides();
}

function prevSlide() {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    updateSlides();
}

// Add event listeners for navigation
document.querySelector('.next-btn').addEventListener('click', nextSlide);
document.querySelector('.prev-btn').addEventListener('click', prevSlide);

// Auto-advance slides every 5 seconds with pause on hover
let autoSlide = setInterval(nextSlide, 5000);

carousel.addEventListener('mouseenter', () => clearInterval(autoSlide));
carousel.addEventListener('mouseleave', () => {
    autoSlide = setInterval(nextSlide, 5000);
});

// Update the leaderboard check function
function checkLeaderboard() {
    const gameStateRef = ref(realtimeDb, 'gameState');
    onValue(gameStateRef, (snapshot) => {
        const gameState = snapshot.val();
        if (!gameState) return;

        // Only redirect when admin publishes leaderboard
        if (gameState.leaderboardPublished) {
            window.location.href = 'leaderboard.html';
            return;
        }

        // Display waiting message based on player status
        const statusText = document.querySelector('.waiting-info h2');
        if (statusText) {
            const completionData = JSON.parse(sessionStorage.getItem('completionData') || '{}');
            statusText.textContent = completionData.status === 'completed' ?
                'Puzzle completed! Waiting for leaderboard...' :
                'Time\'s up! Waiting for leaderboard...';
        }
    });
}

// Initialize with smooth loading and listeners
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    requestAnimationFrame(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    });
    checkLeaderboard(); // Only call once to set up the listener
});

// Add to initialization
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    setupResetListener();
});
