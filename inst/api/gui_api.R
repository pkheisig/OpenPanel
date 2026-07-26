gui_origin_allowed <- function(req) {
    origin <- if (is.null(req$HTTP_ORIGIN)) "" else trimws(req$HTTP_ORIGIN)
    if (!nzchar(origin)) return(TRUE)
    identical(origin, getOption("openpanel.gui_allowed_origins", ""))
}

gui_token_allowed <- function(req) {
    expected <- getOption("openpanel.gui_api_token", "")
    supplied <- if (is.null(req$HTTP_X_SPECTREASY_TOKEN)) "" else req$HTTP_X_SPECTREASY_TOKEN
    nzchar(expected) && identical(as.character(supplied)[1], expected)
}

#* @filter security
function(req, res) {
    if (!gui_origin_allowed(req)) {
        res$status <- 403
        return(list(error = "This GUI origin is not authorized for the local openpanel session."))
    }
    mutating <- toupper(req$REQUEST_METHOD) %in% c("POST", "PUT", "PATCH", "DELETE")
    validates_session <- identical(req$PATH_INFO, "/status") &&
        !is.null(req$HTTP_X_SPECTREASY_TOKEN)
    if ((mutating || validates_session) && !gui_token_allowed(req)) {
        res$status <- 403
        return(list(error = "This request is not authorized for the active openpanel session."))
    }
    origin <- if (is.null(req$HTTP_ORIGIN)) "" else trimws(req$HTTP_ORIGIN)
    if (nzchar(origin)) {
        res$setHeader("Access-Control-Allow-Origin", origin)
        res$setHeader("Vary", "Origin")
    }
    res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    res$setHeader("Access-Control-Allow-Headers", "Content-Type, X-Spectreasy-Token")
    res$setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    if (identical(req$REQUEST_METHOD, "OPTIONS")) {
        res$status <- 200
        return(list())
    }
    plumber::forward()
}

#* @get /status
function() {
    list(status = "ok", time = Sys.time(), package = "openpanel")
}

normalize_gui_module <- function(module) {
    module <- trimws(as.character(module)[1])
    if (is.na(module) || !nzchar(module)) module <- "panel_builder"
    gsub("[^A-Za-z0-9_-]+", "_", module)
}

user_gui_config_path <- function(module) {
    directory <- file.path(tools::R_user_dir("openpanel", which = "config"), "gui_configs")
    dir.create(directory, recursive = TRUE, showWarnings = FALSE)
    file.path(directory, paste0(normalize_gui_module(module), ".json"))
}

#* @get /gui_state
#* @param module
function(module = "panel_builder") {
    path <- user_gui_config_path(module)
    if (!file.exists(path)) {
        return(list(module = normalize_gui_module(module), path = path, config = list()))
    }
    config <- tryCatch(jsonlite::fromJSON(path, simplifyVector = TRUE), error = function(e) list())
    list(module = normalize_gui_module(module), path = path, config = config)
}

#* @post /gui_state
function(req) {
    body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
    module <- if (is.null(body$module)) "panel_builder" else body$module
    config <- if (is.null(body$config_json)) list() else body$config_json
    path <- user_gui_config_path(module)
    jsonlite::write_json(config, path, auto_unbox = TRUE, pretty = TRUE, null = "null")
    list(success = TRUE, module = normalize_gui_module(module), path = path)
}

#* @get /spectral_panel
#* @param cytometer
#* @param configuration
function(cytometer = "aurora", configuration = "") {
    configuration <- if (nzchar(trimws(as.character(configuration)[1]))) configuration else NULL
    tryCatch(
        openpanel:::.spectral_panel_payload(cytometer, character(), configuration),
        error = function(e) list(error = conditionMessage(e))
    )
}

#* @post /spectral_panel_metrics
function(req) {
    body <- jsonlite::fromJSON(req$postBody, simplifyVector = TRUE)
    tryCatch(
        openpanel:::.spectral_panel_payload(
            cytometer = if (is.null(body$cytometer)) "aurora" else body$cytometer,
            fluorophores = if (is.null(body$fluorophores)) character() else body$fluorophores,
            configuration = body$configuration
        ),
        error = function(e) list(error = conditionMessage(e))
    )
}

#* @post /export_spectral_panel_overview
function(req) {
    body <- jsonlite::fromJSON(req$postBody, simplifyVector = TRUE)
    output_file <- tempfile("openpanel_overview_", fileext = ".pdf")
    on.exit(unlink(output_file), add = TRUE)
    tryCatch({
        openpanel:::.write_spectral_panel_overview_pdf(
            cytometer = if (is.null(body$cytometer)) "aurora" else body$cytometer,
            configuration = body$configuration,
            fluorophores = if (is.null(body$fluorophores)) character() else body$fluorophores,
            markers = if (is.null(body$markers)) character() else body$markers,
            output_file = output_file
        )
        payload <- readBin(output_file, what = "raw", n = file.info(output_file)$size)
        list(
            filename = paste0(
                "spectreasy_",
                body$cytometer,
                "_",
                ifelse(is.null(body$configuration), "panel", body$configuration),
                "_overview.pdf"
            ),
            content_type = "application/pdf",
            content_base64 = jsonlite::base64_enc(payload)
        )
    }, error = function(e) list(error = conditionMessage(e)))
}
