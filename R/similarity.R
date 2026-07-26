#' Calculate Cosine Similarity Matrix
#'
#' @param M Reference matrix with fluorophores in rows and detectors in columns.
#' @return A square matrix of pairwise cosine similarities.
#' @export
calculate_similarity_matrix <- function(M) {
    M <- .as_reference_matrix(M, "M")
    norms <- sqrt(rowSums(M^2, na.rm = TRUE))
    norms[norms == 0] <- 1e-6
    M_norm <- M / norms
    sim_mat <- M_norm %*% t(M_norm)
    sim_mat[sim_mat > 1] <- 1
    sim_mat[sim_mat < 0] <- 0
    sim_mat
}

#' Plot Cosine Similarity Matrix
#'
#' @param similarity_matrix Matrix returned by [calculate_similarity_matrix()].
#' @param output_file Optional path at which to save the plot.
#' @param width Plot width in millimetres.
#' @param height Plot height in millimetres.
#' @return A `ggplot` object.
#' @export
plot_similarity_matrix <- function(similarity_matrix,
                                   output_file = NULL,
                                   width = 180,
                                   height = 160) {
    sim_tri <- similarity_matrix
    is_square_same_markers <- nrow(sim_tri) == ncol(sim_tri) &&
        identical(rownames(sim_tri), colnames(sim_tri))
    marker_order <- if (is_square_same_markers) rownames(sim_tri) else colnames(sim_tri)
    if (is_square_same_markers) {
        sim_tri <- sim_tri[marker_order, marker_order, drop = FALSE]
        sim_tri[upper.tri(sim_tri, diag = FALSE)] <- NA
    }

    long <- as.data.frame(sim_tri, check.names = FALSE)
    long$Marker1 <- rownames(sim_tri)
    long <- tidyr::pivot_longer(long, cols = -Marker1, names_to = "Marker2", values_to = "Similarity")
    long <- long[!is.na(long$Similarity), ]

    row_markers <- if (is_square_same_markers) marker_order else rownames(sim_tri)
    col_markers <- if (is_square_same_markers) marker_order else colnames(sim_tri)
    long$Marker1 <- factor(long$Marker1, levels = rev(row_markers))
    long$Marker2 <- factor(long$Marker2, levels = col_markers)
    long$is_diagonal <- as.character(long$Marker1) == as.character(long$Marker2)
    diag_long <- long[long$is_diagonal, , drop = FALSE]
    offdiag_long <- long[!long$is_diagonal, , drop = FALSE]
    offdiag_long$Similarity <- pmax(0, pmin(1, offdiag_long$Similarity))
    offdiag_long$SimilarityFill <- pmin(offdiag_long$Similarity, 0.99)

    n_markers <- max(length(row_markers), length(col_markers))
    text_size <- max(2.4, min(4.8, 36 / max(1, n_markers)))

    p <- ggplot2::ggplot() +
        ggplot2::geom_tile(
            data = offdiag_long,
            ggplot2::aes(Marker2, Marker1, fill = SimilarityFill),
            color = "white",
            linewidth = 0.1
        ) +
        ggplot2::geom_tile(
            data = diag_long,
            ggplot2::aes(Marker2, Marker1),
            fill = "#E6E8EB",
            color = "white",
            linewidth = 0.1
        ) +
        ggplot2::scale_fill_gradientn(
            colors = c("#FFFFFF", "#FEE5D9", "#FCAE91", "#FB6A4A", "#CB181D"),
            values = c(0, 0.5, 0.75, 0.9, 1.0),
            limits = c(0, 0.99),
            name = "Similarity"
        ) +
        ggplot2::geom_text(
            data = offdiag_long,
            ggplot2::aes(Marker2, Marker1, label = sprintf("%.2f", Similarity)),
            size = text_size,
            color = ifelse(offdiag_long$Similarity > 0.8, "white", "black"),
            show.legend = FALSE
        ) +
        ggplot2::labs(
            title = "Fluorophore Spectral Similarity",
            subtitle = paste(
                "Cosine similarity of reference signatures (0 = orthogonal, 1 = identical).",
                "High similarity can indicate potential spillover.",
                sep = "\n"
            ),
            x = NULL,
            y = NULL
        ) +
        ggplot2::theme_minimal(base_size = 13.75) +
        ggplot2::theme(
            axis.text.x = ggplot2::element_text(angle = 45, hjust = 1),
            panel.grid = ggplot2::element_blank(),
            plot.subtitle = ggplot2::element_text(size = 13.2, lineheight = 1.1)
        )

    if (!is.null(output_file)) {
        ggplot2::ggsave(output_file, p, width = width, height = height, units = "mm", dpi = 300)
    }
    p
}

.label_qc_report_batch_page <- function(p, page_idx, page_total, item_label = "Batch") {
    if (page_total <= 1L) return(p)
    p + ggplot2::labs(caption = paste0(item_label, " page ", page_idx, " of ", page_total))
}

.split_qc_report_matrix_marker_batches <- function(marker_names,
                                                    max_markers_per_page = 20) {
    marker_names <- as.character(marker_names)
    max_markers_per_page <- max(1L, as.integer(max_markers_per_page[1]))
    if (length(marker_names) <= max_markers_per_page) return(list(marker_names))
    split(marker_names, ceiling(seq_along(marker_names) / max_markers_per_page))
}

.build_qc_report_matrix_pages <- function(mat,
                                          plot_fun,
                                          max_markers_per_page = 20,
                                          item_label = "Markers") {
    if (is.null(mat) || nrow(mat) == 0 || ncol(mat) == 0) return(list())
    marker_names <- rownames(mat)
    if (is.null(marker_names) || any(marker_names == "")) marker_names <- seq_len(nrow(mat))
    shared_markers <- intersect(marker_names, colnames(mat))
    if (length(shared_markers) == 0) {
        p <- plot_fun(mat, output_file = NULL)
        return(if (is.null(p)) list() else list(p))
    }
    batches <- .split_qc_report_matrix_marker_batches(shared_markers, max_markers_per_page)
    lapply(seq_along(batches), function(page_idx) {
        markers <- batches[[page_idx]]
        .label_qc_report_batch_page(
            plot_fun(mat[markers, markers, drop = FALSE], output_file = NULL),
            page_idx,
            length(batches),
            item_label
        )
    })
}
