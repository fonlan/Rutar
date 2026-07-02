use serde_json::Value;
use std::time::Duration;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationRequest {
    pub engine: String,
    pub proxy_server: Option<String>,
    pub target_language: String,
    pub text: String,
}

fn normalize_proxy_server(proxy_server: Option<&str>) -> Result<Option<String>, String> {
    let Some(proxy_server) = proxy_server
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    let url = reqwest::Url::parse(proxy_server).map_err(|_| {
        "Proxy server must be a valid http://, https://, or socks5:// URL.".to_string()
    })?;
    if !matches!(url.scheme(), "http" | "https" | "socks5") {
        return Err("Proxy server must use http://, https://, or socks5://.".to_string());
    }

    Ok(Some(proxy_server.to_string()))
}

fn build_client(proxy_server: Option<&str>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().timeout(Duration::from_secs(60));

    if let Some(proxy_server) = normalize_proxy_server(proxy_server)? {
        builder =
            builder.proxy(reqwest::Proxy::all(proxy_server).map_err(|error| error.to_string())?);
    }

    builder.build().map_err(|error| error.to_string())
}

fn parse_google_translation_response(body: &Value) -> Option<String> {
    let translated = body
        .get(0)?
        .as_array()?
        .iter()
        .filter_map(|part| part.get(0)?.as_str())
        .collect::<String>();

    (!translated.is_empty()).then_some(translated)
}

fn microsoft_target_language(target_language: &str) -> &str {
    match target_language {
        "zh-CN" => "zh-Hans",
        "zh-TW" => "zh-Hant",
        value => value,
    }
}

fn parse_microsoft_translation_response(body: &Value) -> Option<String> {
    body.get(0)?
        .get("translations")?
        .get(0)?
        .get("text")?
        .as_str()
        .map(ToString::to_string)
}

async fn translate_with_google(
    client: reqwest::Client,
    request: &TranslationRequest,
) -> Result<String, String> {
    let url = reqwest::Url::parse_with_params(
        "https://translate.googleapis.com/translate_a/single",
        &[
            ("client", "gtx"),
            ("sl", "auto"),
            ("tl", request.target_language.as_str()),
            ("dt", "t"),
            ("q", request.text.as_str()),
        ],
    )
    .map_err(|error| error.to_string())?;

    let body = client
        .get(url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;

    parse_google_translation_response(&body)
        .ok_or_else(|| "Translation response did not include translated text.".to_string())
}

async fn translate_with_microsoft(
    client: reqwest::Client,
    request: &TranslationRequest,
) -> Result<String, String> {
    let url = reqwest::Url::parse_with_params(
        "https://api-edge.cognitive.microsofttranslator.com/translate",
        &[
            ("api-version", "3.0"),
            (
                "to",
                microsoft_target_language(request.target_language.as_str()),
            ),
        ],
    )
    .map_err(|error| error.to_string())?;

    let body = client
        .post(url)
        .json(&serde_json::json!([{ "Text": request.text }]))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;

    parse_microsoft_translation_response(&body)
        .ok_or_else(|| "Translation response did not include translated text.".to_string())
}

pub(crate) async fn translate_document_text_impl(
    request: TranslationRequest,
) -> Result<String, String> {
    let client = build_client(request.proxy_server.as_deref())?;

    match request.engine.as_str() {
        "google" => translate_with_google(client, &request).await,
        "microsoft" => translate_with_microsoft(client, &request).await,
        _ => Err("Unsupported translation engine.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_proxy_server_should_accept_http_https_and_socks5() {
        assert_eq!(
            normalize_proxy_server(Some(" socks5://127.0.0.1:7890 ")).unwrap(),
            Some("socks5://127.0.0.1:7890".to_string())
        );
        assert!(normalize_proxy_server(Some("http://127.0.0.1:7890")).is_ok());
        assert!(normalize_proxy_server(Some("https://127.0.0.1:7890")).is_ok());
        assert!(normalize_proxy_server(Some("ftp://127.0.0.1:21")).is_err());
    }

    #[test]
    fn parse_translation_responses_should_extract_text() {
        assert_eq!(
            parse_google_translation_response(&serde_json::json!([[["你好"], ["世界"]]])),
            Some("你好世界".to_string())
        );
        assert_eq!(
            parse_microsoft_translation_response(&serde_json::json!([
                { "translations": [{ "text": "Bonjour" }] }
            ])),
            Some("Bonjour".to_string())
        );
    }
}
