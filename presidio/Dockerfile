FROM mcr.microsoft.com/presidio-analyzer:latest

ARG PRESIDIO_LANG_PACK=en

# Install spaCy models based on selected language pack.
# - en: English only (fastest/smallest)
# - eu: English + German + French + Spanish + Italian
RUN python -m pip install --no-cache-dir spacy && \
    if [ "$PRESIDIO_LANG_PACK" = "eu" ]; then \
      python -m spacy download en_core_web_lg && \
      python -m spacy download de_core_news_lg && \
      python -m spacy download fr_core_news_lg && \
      python -m spacy download es_core_news_lg && \
      python -m spacy download it_core_news_lg ; \
    else \
      python -m spacy download en_core_web_lg ; \
    fi

COPY presidio/nlp_en.yaml /app/presidio_nlp_en.yaml
COPY presidio/nlp_eu.yaml /app/presidio_nlp_eu.yaml
