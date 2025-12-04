// ==========================================
// CONFIGURATION
// ==========================================
const API_BASE = "https://api.jikan.moe/v4";
const GEMINI_API_KEY = "AIzaSyANlDYdii8BpsF5O6g-sJsoS1HKOWZQj4c"; 

const GENRES = [
    { name: "Action", id: 1 }, 
    { name: "Adventure", id: 2 }, 
    { name: "Comedy", id: 4 },
    { name: "Drama", id: 8 }, 
    { name: "Fantasy", id: 10 }, 
    { name: "Horror", id: 14 },
    { name: "Romance", id: 22 }, 
    { name: "Sci-Fi", id: 24 }, 
    { name: "Slice of Life", id: 36 },
    { name: "Sports", id: 30 }, 
    { name: "Mystery", id: 7 }, 
    { name: "Supernatural", id: 37 },
    { name: "Thriller/Suspense", id: 41 },
    { name: "Psychological", id: 40 },
    { name: "Isekai", id: 62 },           
    { name: "Martial Arts (Murim)", id: 17 }, 
    { name: "Game (Leveling)", id: 11 },  
    { name: "Girls Love (Yuri)", id: 26 },
    { name: "Boys Love (Yaoi)", id: 28 },
    { name: "Historical", id: 13 },
    { name: "Harem", id: 35 },
    { name: "School", id: 23 },
    { name: "Shonen", id: 27 },
    { name: "Shojo", id: 25 },
    { name: "Seinen", id: 42 },
    { name: "Josei", id: 43 },
    { name: "Kodomo", id: 15 }
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 1. INITIALIZATION & THEME
// ==========================================

async function init() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    setupGenreDropdown(); 
    
    const heroWrapper = document.getElementById("hero-wrapper");
    if(heroWrapper) heroWrapper.style.display = "block";
    loadHeroSection(); 

    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = ""; 

    createSkeletonSection(contentArea, "Trending Worldwide");
    createSkeletonSection(contentArea, "All-Time Top Rated");

    await delay(500);
    await createSliderSection(contentArea, "Trending Worldwide", `${API_BASE}/top/manga?filter=bypopularity&type=manga&limit=20`, true); 
    await delay(600); 
    await createSliderSection(contentArea, "All-Time Top Rated", `${API_BASE}/top/manga?limit=20`, true);
    await delay(600);
    await createSliderSection(contentArea, "Top Manhwa (Korean)", `${API_BASE}/top/manga?type=manhwa&limit=20`);
    await delay(600);
    await createSliderSection(contentArea, "Popular Light Novels", `${API_BASE}/top/manga?type=lightnovel&filter=bypopularity&limit=20`);
    await delay(600);
    await createSliderSection(contentArea, "Action Hits", `${API_BASE}/manga?genres=1&limit=20&order_by=popularity&sort=desc`);
}

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if(icon) icon.innerText = theme === 'dark' ? 'light_mode' : 'dark_mode';
}

// ==========================================
// 2. HERO SECTION
// ==========================================

async function loadHeroSection() {
    try {
        const response = await fetch(`${API_BASE}/top/manga?filter=bypopularity&limit=1`);
        const data = await response.json();
        const manga = data.data[0];

        const hero = document.getElementById("hero-section");
        const title = document.getElementById("hero-title");
        const synopsis = document.getElementById("hero-synopsis");
        const btn = document.getElementById("hero-btn");

        const bgImage = manga.images.jpg.large_image_url || manga.images.jpg.image_url;
        hero.style.backgroundImage = `url('${bgImage}')`;
        title.innerText = manga.title;
        synopsis.innerText = manga.synopsis ? manga.synopsis.substring(0, 200) + "..." : "No synopsis available.";
        btn.onclick = () => openModal(manga);

    } catch (error) { console.error("Hero Load Error:", error); }
}

// ==========================================
// 3. SMART SEARCH (Separated Logic)
// ==========================================

let selectedGenreIds = new Set(); 

function openSmartSearch() {
    const modal = new bootstrap.Modal(document.getElementById('smartSearchModal'));
    const container = document.getElementById('genreChips');
    container.innerHTML = '';
    selectedGenreIds.clear();

    GENRES.forEach(genre => {
        const chip = document.createElement('div');
        chip.className = 'genre-chip';
        chip.innerText = genre.name;
        chip.dataset.id = genre.id;
        
        chip.onclick = () => {
            if (selectedGenreIds.has(genre.id)) {
                selectedGenreIds.delete(genre.id);
                chip.classList.remove('selected');
            } else {
                selectedGenreIds.add(genre.id);
                chip.classList.add('selected');
            }
        };
        container.appendChild(chip);
    });
    modal.show();
}

// === NEW: AI Executes Complex Search (Dates, Sorts, etc) ===
async function runSmartSearch() {
    const input = document.getElementById('smartSearchInput').value;
    const loading = document.getElementById('smartSearchLoading');
    if(!input) return alert("Please describe what you want!");

    loading.style.display = 'block';

    const genreList = GENRES.map(g => `${g.name} (ID: ${g.id})`).join(", ");
    
    // Updated Prompt to handle Dates and Sorting
    const prompt = `
        User Request: "${input}"
        Genre List: ${genreList}
        
        Your Goal: Translate the user's natural language request into Jikan API parameters.
        
        Return ONLY a JSON object with these keys (exclude keys if not needed):
        - q: String (keywords for text search)
        - genres: String (comma separated IDs)
        - order_by: String ('popularity', 'score', 'start_date', 'title')
        - sort: String ('asc' or 'desc')
        - start_date: String (YYYY-MM-DD)
        - end_date: String (YYYY-MM-DD)
        - status: String ('publishing', 'complete')

        Example 1: "Best horror from 2015" -> {"genres": "14", "order_by": "score", "sort": "desc", "start_date": "2015-01-01", "end_date": "2015-12-31"}
        Example 2: "Manga about vikings" -> {"q": "vikings", "order_by": "popularity", "sort": "desc"}
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        
        const text = data.candidates[0].content.parts[0].text;
        const jsonStr = text.replace(/```json|```/g, '').trim();
        const searchParams = JSON.parse(jsonStr);

        // Close Modal
        const modalEl = document.getElementById('smartSearchModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();

        // Run the specific AI Search
        performAISearch(searchParams);

    } catch (error) {
        console.error("Smart Search Error:", error);
        alert("AI couldn't understand. Please use manual tags.");
    } finally {
        loading.style.display = 'none';
    }
}

// Function to handle the AI's specific search result
async function performAISearch(params, page = 1) {
    const contentArea = document.getElementById("content-area");
    const heroWrapper = document.getElementById("hero-wrapper");
    if(heroWrapper) heroWrapper.style.display = 'none';
    if(page > 1) window.scrollTo({ top: 0, behavior: 'smooth' });

    contentArea.innerHTML = `<h3 class="p-4">AI Smart Results (Page ${page})</h3><div class="search-grid">${Array(10).fill('<div class="manga-card skeleton"></div>').join('')}</div>`;

    // Construct URL from AI Params
    let queryParts = [`limit=24`, `page=${page}`];
    if(params.q) queryParts.push(`q=${params.q}`);
    if(params.genres) queryParts.push(`genres=${params.genres}`);
    if(params.order_by) queryParts.push(`order_by=${params.order_by}`);
    if(params.sort) queryParts.push(`sort=${params.sort}`);
    if(params.start_date) queryParts.push(`start_date=${params.start_date}`);
    if(params.end_date) queryParts.push(`end_date=${params.end_date}`);
    if(params.status) queryParts.push(`status=${params.status}`);

    const queryString = queryParts.join('&');

    try {
        const response = await fetch(`${API_BASE}/manga?${queryString}`);
        const data = await response.json();
        const hasNextPage = data.pagination ? data.pagination.has_next_page : false;

        contentArea.innerHTML = `<h3 class="p-4">AI Found This For You</h3>`;
        const grid = document.createElement("div");
        grid.className = "search-grid";
        
        if (!data.data || data.data.length === 0) contentArea.innerHTML += `<h4 class="p-4 text-muted">No results found for that specific query.</h4>`;
        
        data.data.forEach(item => grid.appendChild(createMangaCard(item)));
        contentArea.appendChild(grid);

        // Pagination for AI Search
        createPagination(contentArea, page, hasNextPage, (newPage) => performAISearch(params, newPage));

    } catch (error) {
        contentArea.innerHTML = `<h3 class="text-danger p-4">Error executing AI search.</h3>`;
    }
}

// === Manual Chip Search ===
async function executeFilterSearch(page = 1) {
    if(page === 1) {
        const modalEl = document.getElementById('smartSearchModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();
    }

    const ids = Array.from(selectedGenreIds).join(',');
    if(!ids) return alert("No genres selected!");

    const contentArea = document.getElementById("content-area");
    const heroWrapper = document.getElementById("hero-wrapper");
    heroWrapper.style.display = 'none';
    
    if(page > 1) window.scrollTo({ top: 0, behavior: 'smooth' });
    
    contentArea.innerHTML = `<h3 class="p-4">Tag Results (Page ${page})</h3><div class="search-grid">${Array(10).fill('<div class="manga-card skeleton"></div>').join('')}</div>`;
    
    try {
        const response = await fetch(`${API_BASE}/manga?genres=${ids}&limit=24&page=${page}&order_by=popularity&sort=desc`);
        const data = await response.json();
        const hasNextPage = data.pagination ? data.pagination.has_next_page : false;
        
        contentArea.innerHTML = `<h3 class="p-4">Results based on your tags</h3>`;
        const grid = document.createElement("div");
        grid.className = "search-grid";
        
        if (data.data.length === 0) contentArea.innerHTML += `<h4 class="p-4 text-muted">No manga found for these tags.</h4>`;
        
        data.data.forEach(item => grid.appendChild(createMangaCard(item)));
        contentArea.appendChild(grid);

        createPagination(contentArea, page, hasNextPage, (newPage) => executeFilterSearch(newPage));
        
    } catch (error) {
        contentArea.innerHTML = `<h3 class="text-danger p-4">Error loading results.</h3>`;
    }
}

// ==========================================
// 4. ASK GEMINI (RECOMMENDATIONS)
// ==========================================

async function askGemini() {
    const favs = getFavorites();
    if (favs.length < 1) {
        alert("Please add at least 1 favorite manga first so the AI knows your taste!");
        return;
    }
    const modal = new bootstrap.Modal(document.getElementById('aiModal'));
    const loadingDiv = document.getElementById('aiLoading');
    const resultDiv = document.getElementById('aiResult');
    modal.show();
    loadingDiv.style.display = "block";
    resultDiv.style.display = "none";

    const titles = favs.map(f => f.title).join(", ");
    const prompt = `I am a manga fan. My favorites: ${titles}. Recommend 3 others. Short 1 sentence reason each. Format as a numbered list.`;
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        if (data.candidates && data.candidates[0].content) {
            const aiText = data.candidates[0].content.parts[0].text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
            resultDiv.innerHTML = aiText;
            loadingDiv.style.display = "none";
            resultDiv.style.display = "block";
        } else { throw new Error("AI returned empty."); }
    } catch (error) {
        loadingDiv.style.display = "none";
        resultDiv.style.display = "block";
        resultDiv.innerHTML = `<span class="text-danger fw-bold">AI Error: ${error.message}</span>`;
    }
}

// ==========================================
// 5. FAVORITES SYSTEM
// ==========================================

function getFavorites() {
    return JSON.parse(localStorage.getItem('mangaFavs')) || [];
}

function isFavorite(id) {
    return getFavorites().some(f => f.mal_id === id);
}

function toggleFavorite(mangaData) {
    let favs = getFavorites();
    const index = favs.findIndex(f => f.mal_id === mangaData.mal_id);
    let isFav = false;

    if (index > -1) {
        favs.splice(index, 1); 
        isFav = false;
    } else {
        const minData = {
            mal_id: mangaData.mal_id, title: mangaData.title, images: mangaData.images,
            type: mangaData.type, score: mangaData.score, synopsis: mangaData.synopsis, url: mangaData.url
        };
        favs.push(minData); 
        isFav = true;
    }
    
    localStorage.setItem('mangaFavs', JSON.stringify(favs));
    updateFavoriteUI(mangaData.mal_id, isFav);
}

function updateFavoriteUI(id, isFav) {
    const cardBtns = document.querySelectorAll(`.fav-btn[data-id="${id}"]`);
    cardBtns.forEach(btn => {
        if(isFav) {
            btn.classList.add('active');
            btn.innerHTML = `<span class="material-symbols-outlined filled">favorite</span>`;
        } else {
            btn.classList.remove('active');
            btn.innerHTML = `<span class="material-symbols-outlined">favorite_border</span>`;
        }
    });

    const modalBtn = document.getElementById('modalFavBtn');
    if (modalBtn && modalBtn.dataset.id == id) {
        if(isFav) {
            modalBtn.classList.remove('btn-outline-danger');
            modalBtn.classList.add('btn-danger');
            modalBtn.innerHTML = `<span class="material-symbols-outlined filled" style="vertical-align: middle;">favorite</span> Added to Favorites`;
        } else {
            modalBtn.classList.remove('btn-danger');
            modalBtn.classList.add('btn-outline-danger');
            modalBtn.innerHTML = `<span class="material-symbols-outlined" style="vertical-align: middle;">favorite_border</span> Add to Favorites`;
        }
    }
}

function loadFavoritesPage() {
    const contentArea = document.getElementById("content-area");
    const heroWrapper = document.getElementById("hero-wrapper");
    if(heroWrapper) heroWrapper.style.display = "none";
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const favs = getFavorites();
    contentArea.innerHTML = `
    <div class="px-4 mb-3 mt-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 class="p-2 border-start border-5 border-danger m-0">My Favorites</h3>
            <div class="d-flex gap-2">
                <button class="btn btn-warning rounded-pill fw-bold shadow-sm" onclick="askGemini()" style="background-color: #FFD700; color: #333; border: none;">✨ Ask AI</button>
                <button class="btn btn-outline-dark rounded-pill" onclick="init()"><span class="material-symbols-outlined" style="vertical-align: middle; font-size: 18px;">arrow_back</span> Home</button>
            </div>
        </div><hr></div>`;

    if(favs.length === 0) {
        contentArea.innerHTML += `<div class="text-center mt-5"><h4>No favorites yet! Go explore and add some hearts. ❤️</h4></div>`;
        return;
    }

    const grid = document.createElement("div");
    grid.className = "search-grid"; 
    favs.forEach(item => grid.appendChild(createMangaCard(item)));
    contentArea.appendChild(grid);
}

// ==========================================
// 6. REUSABLE CARD
// ==========================================

function createMangaCard(item) {
    const card = document.createElement("div");
    card.className = "manga-card";
    const imgUrl = item.images.jpg.large_image_url || item.images.jpg.image_url;
    
    const favBtn = document.createElement("button");
    const isFav = isFavorite(item.mal_id);
    
    favBtn.className = `fav-btn ${isFav ? 'active' : ''}`;
    favBtn.dataset.id = item.mal_id; 
    
    favBtn.innerHTML = isFav 
        ? `<span class="material-symbols-outlined filled">favorite</span>` 
        : `<span class="material-symbols-outlined">favorite_border</span>`;
    
    favBtn.addEventListener("click", (e) => {
        e.stopPropagation(); 
        toggleFavorite(item); 
    });

    card.innerHTML = `<img src="${imgUrl}" alt="${item.title}" loading="lazy">`;
    card.appendChild(favBtn);
    card.addEventListener("click", () => openModal(item));
    return card;
}

// ==========================================
// 7. MODAL & VIBE CHECK (FIXED)
// ==========================================

function openModal(mangaData) {
    const modal = new bootstrap.Modal(document.getElementById('infoModal'));
    modal.show();

    document.getElementById('modalTitle').innerText = mangaData.title;
    document.getElementById('modalOriginalTitle').innerText = mangaData.title_japanese || "";
    document.getElementById('modalImg').src = mangaData.images.jpg.large_image_url || mangaData.images.jpg.image_url;
    document.getElementById('modalType').innerText = mangaData.type || "Manga";
    document.getElementById('modalStatus').innerText = mangaData.status || "Unknown";
    document.getElementById('modalScore').innerText = `Score: ${mangaData.score || "N/A"}`;
    
    const synopsisText = mangaData.synopsis || "No synopsis available.";
    document.getElementById('modalSynopsis').innerText = synopsisText;

    // Built-in Vibe Check
    const vibeContainer = document.getElementById('vibeBadge');
    const resultScore = analyzeMangaVibe(synopsisText);
    
    let vibe = "Neutral 😐";
    let color = "#6c757d"; // Gray
    
    if (resultScore > 0) {
        vibe = "Wholesome / Happy 😊";
        color = "#198754"; // Green
    } else if (resultScore < 0) {
        vibe = "Dark / Serious 💀";
        color = "#dc3545"; // Red
    }

    vibeContainer.innerText = `🤖 AI Vibe: ${vibe}`;
    vibeContainer.style.color = color;
    
    if (color === "#198754") {
        vibeContainer.parentElement.style.background = "rgba(25, 135, 84, 0.1)"; 
    } else if (color === "#dc3545") {
        vibeContainer.parentElement.style.background = "rgba(220, 53, 69, 0.1)";
    } else {
        vibeContainer.parentElement.style.background = "rgba(108, 117, 125, 0.1)"; 
    }

    // Modal Favorite Button
    const favBtn = document.getElementById('modalFavBtn');
    favBtn.dataset.id = mangaData.mal_id;
    updateFavoriteUI(mangaData.mal_id, isFavorite(mangaData.mal_id));

    const newBtn = favBtn.cloneNode(true);
    favBtn.parentNode.replaceChild(newBtn, favBtn);
    
    newBtn.addEventListener('click', () => {
        toggleFavorite(mangaData);
        if(document.querySelector('h3') && document.querySelector('h3').innerText.includes('My Favorites')) {
            loadFavoritesPage();
        }
    });
}

function analyzeMangaVibe(text) {
    if(!text) return 0;
    const words = text.toLowerCase().split(/\W+/);
    
    const positive = new Set(['love', 'comedy', 'funny', 'romance', 'school', 'dream', 'friend', 'happy', 'peace', 'magic', 'adventure', 'cute', 'hope', 'life', 'fun', 'smile', 'win']);
    const negative = new Set(['death', 'kill', 'blood', 'demon', 'war', 'horror', 'curse', 'dark', 'evil', 'monster', 'fear', 'danger', 'revenge', 'attack', 'pain', 'dead', 'murder']);
    
    let score = 0;
    words.forEach(w => {
        if (positive.has(w)) score++;
        if (negative.has(w)) score--;
    });
    return score;
}

// ==========================================
// 8. HELPERS & SEARCH
// ==========================================

function setupGenreDropdown() {
    const dropdown = document.getElementById('genreDropdown');
    if(dropdown.querySelectorAll('.genre-item').length > 0) return;
    GENRES.forEach(genre => {
        const li = document.createElement("li");
        li.className = "genre-item"; 
        const a = document.createElement("a");
        a.className = "dropdown-item";
        a.href = "#"; a.innerText = genre.name;
        a.addEventListener("click", (e) => { e.preventDefault(); loadCategoryPage(genre.id, genre.name, 1); });
        li.appendChild(a);
        const divider = dropdown.querySelector('.dropdown-divider');
        if (divider) dropdown.insertBefore(li, divider.parentNode); else dropdown.appendChild(li); 
    });
}

function createSkeletonSection(container, title) {
    const section = document.createElement("div");
    section.className = "slider-container skeleton-wrapper";
    section.id = `skeleton-${title.replace(/\s+/g, '')}`; 
    section.innerHTML = `<div class="headName"><h3>${title}</h3></div><div class="slider"><div class="imgSlide" style="gap: 15px; overflow: hidden;">${Array(6).fill('<div class="manga-card skeleton"></div>').join('')}</div></div>`;
    container.appendChild(section);
}

async function createSliderSection(container, title, apiUrl, replaceSkeleton = false) {
    try {
        const response = await fetch(apiUrl);
        if(response.status === 429) return; 
        const data = await response.json();
        if (!data.data) return;
        if(replaceSkeleton) { const skel = document.getElementById(`skeleton-${title.replace(/\s+/g, '')}`); if(skel) skel.remove(); }
        const section = document.createElement("div");
        section.className = "slider-container";
        section.innerHTML = `<div class="headName"><h3>${title}</h3></div><div class="slider"><button class="prev"><span class="material-symbols-outlined">arrow_back_ios</span></button><div class="imgSlide"></div><button class="next"><span class="material-symbols-outlined">arrow_forward_ios</span></button></div>`;
        const track = section.querySelector(".imgSlide");
        data.data.forEach(item => track.appendChild(createMangaCard(item)));
        setupSliderButtons(section);
        container.appendChild(section);
    } catch (error) { console.error(`Error loading ${title}:`, error); }
}

function setupSliderButtons(section) {
    const track = section.querySelector(".imgSlide");
    const nextBtn = section.querySelector(".next");
    const prevBtn = section.querySelector(".prev");
    nextBtn.addEventListener("click", () => track.scrollBy({ left: 300, behavior: 'smooth' }));
    prevBtn.addEventListener("click", () => track.scrollBy({ left: -300, behavior: 'smooth' }));
}

async function loadCategoryPage(genreId, genreName, page = 1, orderBy = 'popularity', sortType = 'desc') {
    const contentArea = document.getElementById("content-area");
    const heroWrapper = document.getElementById("hero-wrapper");
    if(heroWrapper) heroWrapper.style.display = "none";
    window.scrollTo({ top: 0, behavior: 'smooth' });
    contentArea.innerHTML = `<h3 class="p-4">Loading ${genreName}...</h3><div class="search-grid">${Array(10).fill('<div class="manga-card skeleton"></div>').join('')}</div>`;
    try {
        await delay(500); 
        const apiUrl = `${API_BASE}/manga?genres=${genreId}&limit=24&page=${page}&order_by=${orderBy}&sort=${sortType}`;
        const response = await fetch(apiUrl);
        if (response.status === 429) throw new Error("Too many requests!");
        const data = await response.json();
        const hasNextPage = data.pagination ? data.pagination.has_next_page : false;
        contentArea.innerHTML = `
        <div class="px-4 mb-3 mt-3"><div class="d-flex justify-content-between align-items-center mb-3"><h3 class="p-2 border-start border-5 border-danger m-0">${genreName} Manga</h3><button class="btn btn-outline-dark rounded-pill" onclick="init()">Home</button></div>
        <div class="d-flex gap-2 flex-wrap"><button class="btn btn-sm ${orderBy === 'popularity' ? 'btn-dark' : 'btn-outline-secondary'} rounded-pill px-3" onclick="loadCategoryPage(${genreId}, '${genreName}', 1, 'popularity', 'desc')">🔥 Popular</button><button class="btn btn-sm ${orderBy === 'score' ? 'btn-dark' : 'btn-outline-secondary'} rounded-pill px-3" onclick="loadCategoryPage(${genreId}, '${genreName}', 1, 'score', 'desc')">⭐ Top Rated</button><button class="btn btn-sm ${orderBy === 'start_date' ? 'btn-dark' : 'btn-outline-secondary'} rounded-pill px-3" onclick="loadCategoryPage(${genreId}, '${genreName}', 1, 'start_date', 'desc')">📅 Newest</button><button class="btn btn-sm ${orderBy === 'title' ? 'btn-dark' : 'btn-outline-secondary'} rounded-pill px-3" onclick="loadCategoryPage(${genreId}, '${genreName}', 1, 'title', 'asc')">🔤 A-Z</button></div><hr></div>`;
        const grid = document.createElement("div");
        grid.className = "search-grid"; 
        if (!data.data || data.data.length === 0) { contentArea.innerHTML += `<h4 class="p-4 text-muted">No manga found.</h4>`; return; }
        data.data.forEach(item => grid.appendChild(createMangaCard(item)));
        contentArea.appendChild(grid);
        createPagination(contentArea, page, hasNextPage, (newPage) => loadCategoryPage(genreId, genreName, newPage, orderBy, sortType));
    } catch (error) { contentArea.innerHTML = `<div class="text-center mt-5"><h3 class="text-danger">Oops! ${error.message}</h3></div>`; }
}

const searchInput = document.getElementById('searchInput');
let searchTimeout;
searchInput.addEventListener("input", (e) => {
    const query = e.target.value;
    clearTimeout(searchTimeout);
    if(query.length === 0){ init(); return; }
    searchTimeout = setTimeout(() => performSearch(query, 1), 500);
});

async function performSearch(query, page = 1) {
    const contentArea = document.getElementById("content-area");
    const heroWrapper = document.getElementById("hero-wrapper");
    if(heroWrapper) heroWrapper.style.display = "none";
    if(page > 1) window.scrollTo({ top: 0, behavior: 'smooth' });
    contentArea.innerHTML = `<h3 class="p-4">Searching "${query}"...</h3><div class="search-grid">${Array(10).fill('<div class="manga-card skeleton"></div>').join('')}</div>`;
    try {
        const response = await fetch(`${API_BASE}/manga?q=${query}&limit=24&page=${page}`);
        if(response.status === 429) throw new Error("Too many requests.");
        const data = await response.json();
        const hasNextPage = data.pagination ? data.pagination.has_next_page : false;
        contentArea.innerHTML = `<h3 class="p-4">Results for "${query}"</h3>`;
        const grid = document.createElement("div");
        grid.className = "search-grid";
        if(data.data && data.data.length > 0) {
            data.data.forEach(item => grid.appendChild(createMangaCard(item)));
            contentArea.appendChild(grid);
            createPagination(contentArea, page, hasNextPage, (newPage) => performSearch(query, newPage));
        } else { contentArea.innerHTML += `<h4 class="p-4 text-muted">No results found.</h4>`; }
    } catch (error) { contentArea.innerHTML = `<h3 class="p-4 text-danger">Error: ${error.message}</h3>`; }
}

function createPagination(container, currentPage, hasNext, onPageChange) {
    const controls = document.createElement("div");
    controls.className = "d-flex justify-content-center align-items-center gap-3 mt-5 mb-5";
    const prevBtn = document.createElement("button");
    prevBtn.className = `btn btn-outline-dark px-4 rounded-pill ${currentPage === 1 ? 'disabled' : ''}`;
    prevBtn.innerText = "Previous";
    prevBtn.onclick = () => onPageChange(currentPage - 1);
    const pageNum = document.createElement("span");
    pageNum.className = "fw-bold fs-5";
    pageNum.innerText = `Page ${currentPage}`;
    const nextBtn = document.createElement("button");
    nextBtn.className = `btn btn-danger px-4 rounded-pill ${!hasNext ? 'disabled' : ''}`;
    nextBtn.innerText = "Next";
    nextBtn.style.backgroundColor = "#DA4D80";
    nextBtn.style.border = "none";
    nextBtn.onclick = () => onPageChange(currentPage + 1);
    controls.appendChild(prevBtn);
    controls.appendChild(pageNum);
    controls.appendChild(nextBtn);
    container.appendChild(controls);
}

init();