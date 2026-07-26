.openpanel_cache <- new.env(parent = emptyenv())

utils::globalVariables(c(
    "ch_idx",
    "fill",
    "Marker1",
    "Marker2",
    "Similarity",
    "SimilarityFill",
    "y"
))

.openpanel_extdata_file <- function(filename) {
    path <- system.file("extdata", filename, package = "openpanel")
    if (nzchar(path) && file.exists(path)) return(path)
    local_path <- file.path("inst", "extdata", filename)
    if (file.exists(local_path)) return(local_path)
    ""
}

.normalize_cytometer_token <- function(x) {
    out <- gsub("[^a-z0-9]+", "", tolower(trimws(as.character(x))))
    out[is.na(out)] <- ""
    out
}

.normalize_detector_token <- function(x) {
    out <- toupper(gsub("\\s+", "", trimws(as.character(x))))
    out <- gsub("([A-Z]+)-([0-9])", "\\1\\2", out, perl = TRUE)
    out[is.na(out)] <- ""
    out
}

.control_file_split_semicolon <- function(x) {
    values <- unlist(strsplit(as.character(x), ";", fixed = TRUE), use.names = FALSE)
    trimws(values[nzchar(trimws(values))])
}

.read_cytometer_dictionary <- function() {
    path <- .openpanel_extdata_file("cytometer_dictionary.csv")
    if (!nzchar(path)) return(data.frame())
    utils::read.csv(path, stringsAsFactors = FALSE, check.names = FALSE)
}

.resolve_cytometer_id <- function(cytometer,
                                  allow_auto = TRUE,
                                  unknown_as_auto = TRUE) {
    id <- tryCatch(
        .resolve_spectral_panel_cytometer(cytometer),
        error = function(e) ""
    )
    if (nzchar(id)) {
        if (identical(id, "discover")) return("discover")
        return(id)
    }
    if (isTRUE(unknown_as_auto) && isTRUE(allow_auto)) "auto" else .normalize_cytometer_token(cytometer)
}

.format_detector_display_label <- function(cytometer,
                                           detector,
                                           laser = "",
                                           description = "") {
    detector <- trimws(as.character(detector)[1])
    description <- trimws(as.character(description)[1])
    if (is.na(detector)) detector <- ""
    if (is.na(description)) description <- ""
    if (identical(.resolve_spectral_panel_cytometer(cytometer), "aurora")) return(detector)
    if (nzchar(description)) return(description)
    detector
}

.validate_reference_matrix <- function(M, arg_name = "M") {
    if (!is.matrix(M) || !is.numeric(M)) {
        stop(arg_name, " must be a numeric matrix.", call. = FALSE)
    }
    if (nrow(M) == 0 || ncol(M) == 0) {
        stop(arg_name, " must have at least one marker row and one detector column.", call. = FALSE)
    }
    if (any(!is.finite(M))) {
        stop(arg_name, " contains non-finite values.", call. = FALSE)
    }
    if (is.null(rownames(M)) || any(!nzchar(trimws(rownames(M))))) {
        stop(arg_name, " must have non-empty marker names in rownames().", call. = FALSE)
    }
    if (is.null(colnames(M)) || any(!nzchar(trimws(colnames(M))))) {
        stop(arg_name, " must have non-empty detector names in colnames().", call. = FALSE)
    }
    M
}

.as_reference_matrix <- function(M, arg_name = "M") {
    if (is.null(M)) stop(arg_name, " must not be NULL.", call. = FALSE)
    if (is.data.frame(M)) {
        df <- as.data.frame(M, stringsAsFactors = FALSE, check.names = FALSE)
        label_idx <- match("fluorophore", tolower(colnames(df)))
        if (is.na(label_idx) && ncol(df) > 0 && !is.numeric(df[[1]])) label_idx <- 1L
        labels <- if (is.na(label_idx)) rownames(df) else as.character(df[[label_idx]])
        if (!is.na(label_idx)) df <- df[, -label_idx, drop = FALSE]
        M <- as.matrix(data.frame(lapply(df, as.numeric), check.names = FALSE))
        rownames(M) <- labels
        colnames(M) <- colnames(df)
    }
    if (is.matrix(M) && !is.numeric(M)) suppressWarnings(storage.mode(M) <- "numeric")
    .validate_reference_matrix(M, arg_name)
}
