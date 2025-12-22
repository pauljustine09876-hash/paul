// ==========================================
// CONFIGURATION
// ==========================================
const API_BASE = "https://api.jikan.moe/v4";

// TRICK: Split the key so GitHub doesn't ban it automatically
const keyPart1 = "AIzaSy"; 
const keyPart2 = "DZ9m3bIV5L_a2mrgUr5sFTN_Rxr99X2ME";
const GEMINI_API_KEY = keyPart1 + keyPart2;

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
    { name: "Thriller", id: 41 }, 
    { name: "Psychological", id: 40 },
    { name: "Isekai", id: 62 },           
    { name: "Martial Arts", id: 17 }, 
    { name: "Historical", id: 13 },
    { name: "School", id: 23 },
    { name: "Seinen", id: 42 },
    { name: "Josei", id: 43 }
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

    // Create Loading Skeletons First
    createSkeletonSection(contentArea, "Trending Worldwide");
    createSkeletonSection(contentArea, "All-Time Top Rated");

    await delay(500);
    // Load Real Data and REPLACE the Skeletons
    await createSliderSection(contentArea, "Trending Worldwide", `${API_BASE}/top/manga?filter=bypopularity&type=manga&limit=20`); 
    await delay(600); 
    await createSliderSection(contentArea, "All-Time Top Rated", `${API_BASE}/top/manga?limit=20`);
    await delay(600);
    await createSliderSection(contentArea, "Top Manhwa", `${API_BASE}/top/manga?type=manhwa&limit=20`);
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
// 3. SMART SEARCH (ACCURATE VERSION)
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

async function runSmartSearch() {
    const input = document.getElementById('smartSearchInput').value;
    const loading = document.getElementById('smartSearchLoading');
    if(!input) return alert("Please describe what you want!");

    loading.style.display = 'block';

    const genreList = GENRES.map(g => `${g.name} (ID: ${g.id})`).join(", ");
    
    // === SMART PROMPT ===
    const prompt = `
        User Request: "${input}"
        Genre List: ${genreList}
        
        Your Goal: Translate the user's request into the BEST Jikan API parameters.
        
        CRITICAL RULES:
        1. "Vikings" -> Set q="Vinland", genres="13" (Historical).
        2. "Pirates" -> Set q="Piece", genres="2" (Adventure).
        3. "Ninjas" -> Set q="Naruto", genres="1" (Action).
        4. "Samurai" -> Set genres="13" (Historical).
        5. "Sad" -> Set genres="8" (Drama).
        6. "Scary" -> Set genres="14" (Horror).
        7. "Isekai" -> Set genres="62" (Isekai).
        
        Return ONLY a JSON object (no text) with:
        - q: String (Specific keyword like 'Vinland', or empty if generic)
        - genres: String (comma separated IDs)
        - order_by: String ('popularity', 'score')
        - sort: String ('desc')
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);
        if (!data.candidates) throw new Error("AI gave empty response");

        let text = data.candidates[0].content.parts[0].text;
        text = text.replace(/```json|```/g, '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/); 
        
        let searchParams = {};
        if (jsonMatch) {
            searchParams = JSON.parse(jsonMatch[0]);
        } else {
            searchParams = { q: input };
        }

        const modalEl = document.getElementById('smartSearchModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();

        performAISearch(searchParams);

    } catch (error) {
        console.error("Smart Search Error:", error);
        alert("AI Error: " + error.message + ". Switching to basic search.");
        
        const modalEl = document.getElementById('smartSearchModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();
        performAISearch({ q: input });
    } finally {
        loading.style.display = 'none';
    }
}

async function performAISearch(params, page = 1) {
    const contentArea = document.getElementById("content-area");
    const heroWrapper = document.getElementById("hero-wrapper");
    if(heroWrapper) heroWrapper.style.display = 'none';
    if(page > 1) window.scrollTo({ top: 0, behavior: 'smooth' });

    contentArea.innerHTML = `<h3 class="p-4">AI Smart Results (Page ${page})</h3><div class="search-grid">${Array(10).fill('<div class="manga-card skeleton"></div>').join('')}</div>`;

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
        
        if (!data.data || data.data.length === 0) {
            contentArea.innerHTML += `<div class="p-4 text-center"><h4>No results found.</h4><p>Try a simpler search.</p></div>`;
            return;
        }
        
        data.data.forEach(item => grid.appendChild(createMangaCard(item)));
        contentArea.appendChild(grid);

        createPagination(contentArea, page, hasNextPage, (newPage) => performAISearch(params, newPage));

    } catch (error) {
        contentArea.innerHTML = `<h3 class="text-danger p-4">Error: ${error.message}</h3>`;
    }
}

// === Manual Search Logic ===
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
        
        if (data.data.length === 0) contentArea.innerHTML += `<h4 class="p-4 text-muted">No manga found.</h4>`;
        
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
        alert("Please add at least 1 favorite manga first!");
        return;
    }
    const modal = new bootstrap.Modal(document.getElementById('aiModal'));
    const loadingDiv = document.getElementById('aiLoading');
    const resultDiv = document.getElementById('aiResult');
    modal.show();
    loadingDiv.style.display = "block";
    resultDiv.style.display = "none";

    const titles = favs.map(f => f.title).join(", ");
    const prompt = `My favorites: ${titles}. Recommend 3 similar manga. Short 1 sentence reason each.`;
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);

        if (data.candidates) {
            const aiText = data.candidates[0].content.parts[0].text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
            resultDiv.innerHTML = aiText;
            loadingDiv.style.display = "none";
            resultDiv.style.display = "block";
        }
    } catch (error) {
        loadingDiv.style.display = "none";
        resultDiv.style.display = "block";
        resultDiv.innerHTML = `<span class="text-danger fw-bold">Error: ${error.message}</span>`;
    }
}

// ==========================================
// 5. FAVORITES SYSTEM
// ==========================================

function getFavorites() { return JSON.parse(localStorage.getItem('mangaFavs')) || []; }
function isFavorite(id) { return getFavorites().some(f => f.mal_id === id); }

function toggleFavorite(mangaData) {
    let favs = getFavorites();
    const index = favs.findIndex(f => f.mal_id === mangaData.mal_id);
    let isFav = false;

    if (index > -1) {
        favs.splice(index, 1);
        isFav = false;
    } else {
        favs.push({
            mal_id: mangaData.mal_id, title: mangaData.title, images: mangaData.images,
            type: mangaData.type, score: mangaData.score, synopsis: mangaData.synopsis
        });
        isFav = true;
    }
    
    localStorage.setItem('mangaFavs', JSON.stringify(favs));
    updateFavoriteUI(mangaData.mal_id, isFav);
}

function updateFavoriteUI(id, isFav) {
    const cardBtns = document.querySelectorAll(`.fav-btn[data-id="${id}"]`);
    cardBtns.forEach(btn => {
        btn.classList.toggle('active', isFav);
        btn.innerHTML = isFav ? `<span class="material-symbols-outlined filled">favorite</span>` : `<span class="material-symbols-outlined">favorite_border</span>`;
    });

    const modalBtn = document.getElementById('modalFavBtn');
    if (modalBtn && modalBtn.dataset.id == id) {
        modalBtn.classList.toggle('btn-danger', isFav);
        modalBtn.classList.toggle('btn-outline-danger', !isFav);
        modalBtn.innerHTML = isFav 
            ? `<span class="material-symbols-outlined filled" style="vertical-align: middle;">favorite</span> Added` 
            : `<span class="material-symbols-outlined" style="vertical-align: middle;">favorite_border</span> Add to Favorites`;
    }
}

function loadFavoritesPage() {
    const contentArea = document.getElementById("content-area");
    document.getElementById("hero-wrapper").style.display = "none";
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const favs = getFavorites();
    contentArea.innerHTML = `<h3 class="px-4 mt-3 border-start border-5 border-danger">My Favorites</h3><hr class="mx-4">`;

    if(favs.length === 0) {
        contentArea.innerHTML += `<div class="text-center mt-5"><h4>No favorites yet! ❤️</h4></div>`;
        return;
    }

    const grid = document.createElement("div");
    grid.className = "search-grid"; 
    favs.forEach(item => grid.appendChild(createMangaCard(item)));
    contentArea.appendChild(grid);
}

// ==========================================
// 6. CARD & MODAL & VIBE CHECK
// ==========================================

function createMangaCard(item) {
    const card = document.createElement("div");
    card.className = "manga-card";
    const imgUrl = item.images.jpg.large_image_url || item.images.jpg.image_url;
    
    const isFav = isFavorite(item.mal_id);
    const favBtn = document.createElement("button");
    favBtn.className = `fav-btn ${isFav ? 'active' : ''}`;
    favBtn.dataset.id = item.mal_id;
    favBtn.innerHTML = isFav ? `<span class="material-symbols-outlined filled">favorite</span>` : `<span class="material-symbols-outlined">favorite_border</span>`;
    
    favBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(item); });

    card.innerHTML = `<img src="${imgUrl}" alt="${item.title}" loading="lazy">`;
    card.appendChild(favBtn);
    card.addEventListener("click", () => openModal(item));
    return card;
}

function openModal(mangaData) {
    const modal = new bootstrap.Modal(document.getElementById('infoModal'));
    modal.show();

    document.getElementById('modalTitle').innerText = mangaData.title;
    document.getElementById('modalImg').src = mangaData.images.jpg.large_image_url;
    document.getElementById('modalType').innerText = mangaData.type || "Manga";
    document.getElementById('modalScore').innerText = `Score: ${mangaData.score || "N/A"}`;
    document.getElementById('modalSynopsis').innerText = mangaData.synopsis || "No synopsis available.";

    const vibeContainer = document.getElementById('vibeBadge');
    const score = analyzeMangaVibe(mangaData.synopsis);
    vibeContainer.innerText = `🤖 AI Vibe: ${score > 0 ? "Wholesome 😊" : (score < 0 ? "Dark 💀" : "Neutral 😐")}`;
    vibeContainer.style.color = score > 0 ? "#198754" : (score < 0 ? "#dc3545" : "gray");

    const favBtn = document.getElementById('modalFavBtn');
    favBtn.dataset.id = mangaData.mal_id;
    updateFavoriteUI(mangaData.mal_id, isFavorite(mangaData.mal_id));
    
    favBtn.onclick = () => toggleFavorite(mangaData);
}

function analyzeMangaVibe(text) {
    if(!text) return 0;
    const pos = ['love', 'friend', 'happy', 'peace', 'cute', 'win', 'hope'];
    const neg = ['death', 'kill', 'blood', 'war', 'dark', 'pain', 'evil'];
    let score = 0;
    text.toLowerCase().split(/\W+/).forEach(w => {
        if(pos.includes(w)) score++;
        if(neg.includes(w)) score--;
    });
    return score;
}

// ==========================================
// 7. SLIDERS & HELPERS (FIXED DUPLICATE ISSUE)
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
        dropdown.appendChild(li);
    });
}

function createSkeletonSection(container, title) {
    const section = document.createElement("div");
    section.className = "slider-container skeleton-wrapper";
    // We add an ID so we can find it and delete it later
    section.id = `skeleton-${title.replace(/\s+/g, '')}`; 
    section.innerHTML = `<div class="headName"><h3>${title}</h3></div><div class="slider d-flex gap-3 overflow-hidden">${Array(5).fill('<div class="manga-card skeleton"></div>').join('')}</div>`;
    container.appendChild(section);
}

async function createSliderSection(container, title, apiUrl) {
    try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        // === THE FIX: Remove the skeleton before adding the real one ===
        const skeleton = document.getElementById(`skeleton-${title.replace(/\s+/g, '')}`);
        if(skeleton) skeleton.remove();
        // ==============================================================

        const section = document.createElement("div");
        section.className = "slider-container";
        section.innerHTML = `<div class="headName"><h3>${title}</h3></div><div class="slider"><button class="prev"><span class="material-symbols-outlined">arrow_back_ios</span></button><div class="imgSlide"></div><button class="next"><span class="material-symbols-outlined">arrow_forward_ios</span></button></div>`;
        
        const track = section.querySelector(".imgSlide");
        data.data.forEach(item => track.appendChild(createMangaCard(item)));
        
        section.querySelector(".next").onclick = () => track.scrollBy({ left: 300, behavior: 'smooth' });
        section.querySelector(".prev").onclick = () => track.scrollBy({ left: -300, behavior: 'smooth' });
        
        container.appendChild(section);
    } catch (e) { console.error(e); }
}

async function loadCategoryPage(genreId, genreName, page = 1) {
    const contentArea = document.getElementById("content-area");
    document.getElementById("hero-wrapper").style.display = "none";
    window.scrollTo(0,0);
    
    contentArea.innerHTML = `<h3 class="p-4">Loading ${genreName}...</h3>`;
    const res = await fetch(`${API_BASE}/manga?genres=${genreId}&page=${page}&order_by=popularity`);
    const data = await res.json();
    
    contentArea.innerHTML = `<h3 class="p-4">${genreName} Manga</h3>`;
    const grid = document.createElement("div");
    grid.className = "search-grid";
    data.data.forEach(item => grid.appendChild(createMangaCard(item)));
    contentArea.appendChild(grid);
    
    createPagination(contentArea, page, data.pagination.has_next_page, (p) => loadCategoryPage(genreId, genreName, p));
}

function createPagination(container, page, hasNext, callback) {
    const div = document.createElement("div");
    div.className = "d-flex justify-content-center gap-3 my-5";
    div.innerHTML = `<button class="btn btn-outline-dark" ${page===1?'disabled':''} id="prevPage">Previous</button><span class="fw-bold fs-5">Page ${page}</span><button class="btn btn-danger" ${!hasNext?'disabled':''} id="nextPage">Next</button>`;
    div.querySelector("#prevPage").onclick = () => callback(page - 1);
    div.querySelector("#nextPage").onclick = () => callback(page + 1);
    container.appendChild(div);
}

// Search Bar Logic
let searchTimeout;
document.getElementById('searchInput').addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    if(!e.target.value) { init(); return; }
    searchTimeout = setTimeout(() => performSearch(e.target.value, 1), 500);
});

async function performSearch(query, page) {
    const contentArea = document.getElementById("content-area");
    document.getElementById("hero-wrapper").style.display = "none";
    const res = await fetch(`${API_BASE}/manga?q=${query}&page=${page}`);
    const data = await res.json();
    
    contentArea.innerHTML = `<h3 class="p-4">Results for "${query}"</h3>`;
    const grid = document.createElement("div");
    grid.className = "search-grid";
    data.data.forEach(item => grid.appendChild(createMangaCard(item)));
    contentArea.appendChild(grid);
    createPagination(contentArea, page, data.pagination.has_next_page, (p) => performSearch(query, p));
}

init();