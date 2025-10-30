# === AI TREND DETECTOR — Google Trends Requêtes Associées Clone ===
# Author: Fadi + ChatGPT (2025)
# Description: Replicates Google Trends "related queries to AI" logic using SerpApi + semantic scoring

from serpapi import GoogleSearch
from sentence_transformers import SentenceTransformer, util
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import time
import json
from tqdm import tqdm

# ========== CONFIGURATION ==========
FAST_REFRESH = True  # ⚡ Mode rapide sans analyse d'articles
API_KEY = "1cbfeb224230b881918edcc85ecc545ad32a53a9bde067c5ca58f9a4ac26f9ff"  # <-- Remplace ici
GEO_LIST = ["US", "GB", "FR", "IN", "JP", "AU"]  # zones géographiques à agréger
TIME_WINDOW_HOURS = 168  # 7 jours
TOP_N = 10

# Mots à exclure (faux positifs typiques)
BLACKLIST = [
    "fc", "football", "match", "movie", "record", "león", "music", "trailer",
    "horoscope", "festival", "concert", "wrestling", "series", "tournament"
]

# Initialisation du modèle sémantique (embeddings)
print("🧠 Loading semantic model (sentence-transformers)...")
model = SentenceTransformer("all-MiniLM-L6-v2")

# Vecteur de référence “Intelligence Artificielle”
ai_reference = model.encode(
    "artificial intelligence, machine learning, neural networks, LLM, ChatGPT, GPT, OpenAI, DeepMind, Stability AI, Mistral AI, Anthropic, AI model, AI research"
)

# ========== FONCTIONS ==========

def fetch_trends(geo):
    """Récupère les tendances SerpApi pour une région donnée"""
    params = {
        "engine": "google_trends_trending_now",
        "geo": geo,
        "hours": TIME_WINDOW_HOURS,
        "api_key": API_KEY
    }
    try:
        results = GoogleSearch(params).get_dict()
        return results.get("trending_searches", [])
    except Exception as e:
        print(f"⚠️ Erreur API pour {geo}: {e}")
        return []

def fetch_news_snippets(news_endpoint):
    """Récupère les titres + snippets associés via serpapi_news_link"""
    try:
        if not news_endpoint or "page_token=" not in news_endpoint:
            return ""
        token = news_endpoint.split("page_token=")[-1]
        results = GoogleSearch({
            "engine": "google_trends_news",
            "page_token": token,
            "api_key": API_KEY
        }).get_dict()
        articles = results.get("news_results", [])
        text = " ".join(a.get("title", "") + " " + a.get("snippet", "") for a in articles)
        return text
    except Exception:
        return ""

def semantic_score(text):
    """Calcule la similarité sémantique avec le thème IA"""
    if not text.strip():
        return 0.0
    vec = model.encode(text)
    return float(util.cos_sim(ai_reference, vec))

def normalize(values):
    """Normalisation 0-1"""
    arr = np.array(values, dtype=float)
    if np.ptp(arr) == 0:
        return np.ones_like(arr)
    return (arr - arr.min()) / np.ptp(arr)

def is_blacklisted(text):
    """Vérifie si un mot interdit apparaît"""
    text = text.lower()
    return any(bad in text for bad in BLACKLIST)

# ========== PIPELINE PRINCIPAL ==========

print("🌍 Fetching global AI trends...")

all_trends = []
for geo in GEO_LIST:
    trends = fetch_trends(geo)
    print(f"✅ {geo}: {len(trends)} trends récupérées")
    for t in trends:
        query = t.get("query", "")
        if not query or is_blacklisted(query):
            continue
        all_trends.append({
            "query": query,
            "geo": geo,
            "search_volume": t.get("search_volume", 0) or 0,
            "news_link": t.get("serpapi_news_link", "")
        })

# Déduplication par query
df = pd.DataFrame(all_trends).drop_duplicates(subset="query").reset_index(drop=True)

print(f"🔎 Total unique trends: {len(df)}")

# Analyse contextuelle
semantic_scores = []
# Analyse contextuelle (FASTREFRESH)
semantic_scores = []

for i, row in tqdm(df.iterrows(), total=len(df), desc="Analyzing context"):
    # ⚡ Si mode rapide → analyse uniquement la requête elle-même
    if FAST_REFRESH:
        text_to_analyze = row["query"]
    else:
        text_to_analyze = fetch_news_snippets(row["news_link"]) or row["query"]

    if is_blacklisted(text_to_analyze):
        semantic_scores.append(0)
        continue

    semantic_scores.append(semantic_score(text_to_analyze))

    # ⏸️ Supprimer le time.sleep si FAST_REFRESH
    if not FAST_REFRESH:
        time.sleep(1.5)


df["semantic_score"] = semantic_scores

# Heuristique de “fraîcheur” (growth_score)
df["growth_score"] = np.where(df["search_volume"] > 50000, 1,
                       np.where(df["search_volume"] > 10000, 0.8,
                       np.where(df["search_volume"] > 1000, 0.6, 0.4)))

# Normalisation
df["vol_norm"] = normalize(df["search_volume"])
df["sem_norm"] = df["semantic_score"]
df["grow_norm"] = df["growth_score"]

# 🔹 Filtrage par volume minimum (ex: >= 1000 recherches)
MIN_VOLUME = 15000
df = df[df["search_volume"] >= MIN_VOLUME]

# Score final
df["score_final"] = 0.5*df["vol_norm"] + 0.3*df["grow_norm"] + 0.2*df["sem_norm"]

# Filtrage des non-IA (score < 0.35)
df = df[df["sem_norm"] >= 0.35].sort_values("score_final", ascending=False)

# Top 10 global
top10 = df.head(TOP_N)

# Affichage final
print("\n🔥 TOP 10 — Global AI Buzz (7 derniers jours)")
for i, row in enumerate(top10.itertuples(), 1):
    print(f"{i}. {row.query}")
    print(f"   🌎 {row.geo} | 📊 Vol: {row.search_volume} | 🧠 IA score: {row.semantic_score:.2f} | ⭐ Final: {row.score_final:.2f}")

# Export JSON (si tu veux le stocker pour n8n)
top10.to_json("ai_trends_7days.json", orient="records", indent=2)
print("\n✅ Résultats exportés → ai_trends_7days.json")
