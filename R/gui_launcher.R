.gui_namespace_available <- function(package) {
    requireNamespace(package, quietly = TRUE)
}

.normalize_gui_port <- function(port, arg_name = "port") {
    value <- suppressWarnings(as.integer(port))
    if (length(port) != 1L || is.na(value) || value < 1L || value > 65535L ||
        !identical(as.numeric(port), as.numeric(value))) {
        stop(arg_name, " must be one integer between 1 and 65535.", call. = FALSE)
    }
    value
}

.gui_tcp_port_open <- function(port, host = "127.0.0.1") {
    connection <- tryCatch(
        suppressWarnings(socketConnection(
            host = host,
            port = .normalize_gui_port(port),
            open = "r+b",
            blocking = TRUE,
            timeout = 0.2
        )),
        error = function(e) NULL
    )
    if (is.null(connection)) return(FALSE)
    close(connection)
    TRUE
}

.gui_port_is_available <- function(port) {
    if (.gui_tcp_port_open(port)) return(FALSE)
    socket <- tryCatch(serverSocket(.normalize_gui_port(port)), error = function(e) NULL)
    if (is.null(socket)) return(FALSE)
    close(socket)
    TRUE
}

.resolve_gui_dev_port <- function(dev_frontend_port = NULL, preferred = 5174L) {
    if (!is.null(dev_frontend_port)) {
        port <- .normalize_gui_port(dev_frontend_port, "dev_frontend_port")
        if (!.gui_port_is_available(port)) {
            stop("The requested Vite frontend port is already in use: ", port, call. = FALSE)
        }
        return(port)
    }
    candidates <- seq.int(.normalize_gui_port(preferred), min(65535L, preferred + 100L))
    available <- candidates[vapply(candidates, .gui_port_is_available, logical(1))]
    if (!length(available)) {
        stop("Could not find an available Vite frontend port.", call. = FALSE)
    }
    available[[1]]
}

.prepare_gui_paths <- function(locator = system.file) {
    api_path <- locator("api", "gui_api.R", package = "openpanel")
    gui_path <- locator("gui", package = "openpanel")
    if (!nzchar(api_path) || !file.exists(api_path)) {
        stop("Could not find the bundled openpanel API script.", call. = FALSE)
    }
    if (!nzchar(gui_path) || !dir.exists(gui_path)) {
        stop("Could not find the bundled openpanel GUI assets.", call. = FALSE)
    }
    list(api_path = api_path, gui_path = gui_path, dist_path = file.path(gui_path, "dist"))
}

.resolve_gui_frontend <- function(gui_path,
                                  dist_path,
                                  port,
                                  dev_mode = FALSE,
                                  dev_frontend_port = NULL) {
    if (!isTRUE(dev_mode)) {
        if (!file.exists(file.path(dist_path, "index.html"))) {
            stop("Bundled GUI assets not found at: ", dist_path, call. = FALSE)
        }
        return(list(mode = "bundled", frontend_url = paste0("http://127.0.0.1:", port)))
    }
    npm_bin <- Sys.which("npm")
    if (!nzchar(npm_bin)) {
        stop("Developer mode requires npm on PATH.", call. = FALSE)
    }
    if (!dir.exists(file.path(gui_path, "node_modules"))) {
        stop("Run `npm install` in ", gui_path, " before using developer mode.", call. = FALSE)
    }
    frontend_port <- .resolve_gui_dev_port(dev_frontend_port)
    list(
        mode = "dev",
        frontend_url = paste0("http://127.0.0.1:", frontend_port),
        frontend_port = frontend_port,
        npm_bin = npm_bin
    )
}

.gui_session_token <- function(n = 32L) {
    bytes <- if (.gui_namespace_available("openssl")) {
        openssl::rand_bytes(n)
    } else {
        as.raw(sample.int(256L, n, replace = TRUE) - 1L)
    }
    paste(sprintf("%02x", as.integer(bytes)), collapse = "")
}

.gui_url_origin <- function(url) {
    origin <- sub("^(https?://[^/]+).*$", "\\1", url, ignore.case = TRUE)
    if (!grepl("^https?://", origin, ignore.case = TRUE)) "" else origin
}

.spawn_gui_dev_process <- function(gui_path,
                                   api_port,
                                   frontend_port,
                                   npm_bin,
                                   api_token) {
    if (!.gui_namespace_available("processx")) {
        stop("Developer mode requires package 'processx'.", call. = FALSE)
    }
    child_env <- Sys.getenv()
    child_env[["VITE_API_BASE"]] <- paste0("http://127.0.0.1:", api_port)
    child_env[["VITE_SPECTREASY_TOKEN"]] <- api_token
    processx::process$new(
        npm_bin,
        c("run", "dev", "--", "--host", "127.0.0.1", "--port", as.character(frontend_port), "--strictPort"),
        wd = gui_path,
        env = child_env,
        stdout = "|",
        stderr = "2>&1",
        cleanup = TRUE,
        cleanup_tree = TRUE
    )
}

.wait_for_gui_frontend <- function(process, frontend_port, timeout = 15) {
    deadline <- Sys.time() + timeout
    repeat {
        if (!isTRUE(process$is_alive())) {
            output <- paste(process$read_all_output_lines(), collapse = "\n")
            stop("The Vite frontend stopped before becoming ready.\n", output, call. = FALSE)
        }
        if (.gui_tcp_port_open(frontend_port)) return(invisible(TRUE))
        if (Sys.time() >= deadline) {
            process$kill_tree()
            stop("Timed out waiting for the Vite frontend.", call. = FALSE)
        }
        Sys.sleep(0.1)
    }
}

.launch_openpanel_gui <- function(port = 8000,
                                  open_browser = TRUE,
                                  dev_mode = FALSE,
                                  dev_frontend_port = NULL) {
    required <- c("plumber", "httpuv", "later")
    missing <- required[!vapply(required, .gui_namespace_available, logical(1))]
    if (length(missing)) {
        stop(
            "The openpanel GUI requires: ",
            paste(missing, collapse = ", "),
            ".",
            call. = FALSE
        )
    }
    port <- .normalize_gui_port(port)
    paths <- .prepare_gui_paths()
    frontend <- .resolve_gui_frontend(
        paths$gui_path,
        paths$dist_path,
        port,
        dev_mode,
        dev_frontend_port
    )
    api_token <- .gui_session_token()
    dev_server <- NULL
    if (identical(frontend$mode, "dev")) {
        dev_server <- .spawn_gui_dev_process(
            paths$gui_path,
            port,
            frontend$frontend_port,
            frontend$npm_bin,
            api_token
        )
        .wait_for_gui_frontend(dev_server, frontend$frontend_port)
        on.exit({
            if (isTRUE(dev_server$is_alive())) dev_server$kill_tree()
        }, add = TRUE)
    }

    options(
        openpanel.gui_api_token = api_token,
        openpanel.gui_allowed_origins = .gui_url_origin(frontend$frontend_url)
    )
    separator <- if (grepl("?", frontend$frontend_url, fixed = TRUE)) "&" else "?"
    frontend_url <- paste0(
        frontend$frontend_url,
        separator,
        "api=", utils::URLencode(paste0("http://127.0.0.1:", port), reserved = TRUE),
        "#token=", utils::URLencode(api_token, reserved = TRUE)
    )

    message("Openpanel spectral panel builder")
    message("Frontend: ", sub("#token=[^&]*", "", frontend_url))
    message("API port: ", port)
    message("Press Ctrl + C in this R console to terminate the app.")

    pr <- plumber::plumb(paths$api_path)
    if (!isTRUE(dev_mode)) pr <- plumber::pr_static(pr, "/", paths$dist_path)
    if (isTRUE(open_browser)) {
        local({
            url <- frontend_url
            later::later(function() utils::browseURL(url), delay = 0.15)
        })
    }
    pr$run(port = port, host = "127.0.0.1", docs = FALSE, quiet = TRUE)
    invisible(NULL)
}
