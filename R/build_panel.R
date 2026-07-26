#' Launch the Spectral Panel Builder
#'
#' Opens the interactive browser-based spectral panel builder with packaged
#' theoretical spectra for Aurora, FACSDiscover, ID7000, and Attune Xenith
#' cytometers.
#'
#' @param port Local API port.
#' @param open_browser Open the builder in the default browser.
#' @param dev_mode Use the Vite development server instead of bundled assets.
#' @param dev_frontend_port Optional fixed Vite port. When `NULL`, the first
#'   available port from 5174 onward is used.
#' @return Invisibly returns `NULL`. The function blocks while the API runs.
#' @export
#' @examples
#' if (interactive()) {
#'   build_panel(open_browser = FALSE)
#' }
build_panel <- function(port = 8000,
                        open_browser = TRUE,
                        dev_mode = FALSE,
                        dev_frontend_port = NULL) {
    .launch_openpanel_gui(
        port = port,
        open_browser = open_browser,
        dev_mode = dev_mode,
        dev_frontend_port = dev_frontend_port
    )
    invisible(NULL)
}
