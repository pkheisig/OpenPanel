test_that("build_panel forwards its complete launcher contract", {
    call <- NULL
    testthat::local_mocked_bindings(
        .launch_openpanel_gui = function(...) {
            call <<- list(...)
            invisible(NULL)
        },
        .package = "openpanel"
    )

    expect_null(openpanel::build_panel(
        port = 8124,
        open_browser = FALSE,
        dev_mode = TRUE,
        dev_frontend_port = 5176
    ))
    expect_equal(call$port, 8124)
    expect_false(call$open_browser)
    expect_true(call$dev_mode)
    expect_equal(call$dev_frontend_port, 5176)
})

test_that("all extracted cytometers and configurations remain available", {
    expect_equal(
        openpanel:::.spectral_panel_libraries()$id,
        c("aurora", "discover", "id7000", "xenith")
    )
    expect_equal(nrow(openpanel:::.spectral_panel_configurations("aurora")), 4L)
    expect_equal(nrow(openpanel:::.spectral_panel_configurations("discover")), 2L)
    expect_equal(nrow(openpanel:::.spectral_panel_configurations("id7000")), 3L)
    expect_equal(openpanel:::.spectral_panel_configurations("xenith")$id, "full")
})

test_that("panel payloads retain data and metrics for every cytometer", {
    cases <- list(
        aurora = NULL,
        discover = "discover_s8",
        id7000 = "id7000_4l",
        xenith = "full"
    )
    for (cytometer in names(cases)) {
        payload <- openpanel:::.spectral_panel_payload(
            cytometer = cytometer,
            configuration = cases[[cytometer]]
        )
        expect_identical(payload$cytometer, cytometer)
        expect_gt(nrow(payload$detectors), 0L)
        expect_gt(nrow(payload$fluorophores), 0L)
        expect_true(all(c("detector", "label", "laser", "emission", "color") %in% names(payload$detectors)))
    }

    selected <- openpanel:::.spectral_panel_payload(
        "aurora",
        fluorophores = c("Alexa Fluor 488", "Alexa Fluor 647")
    )
    expect_equal(selected$selected, c("Alexa Fluor 488", "Alexa Fluor 647"))
    expect_equal(dim(selected$similarity), c(2L, 3L))
    expect_length(selected$peak_detectors, 2L)
    expect_true(is.finite(selected$complexity_index))
})

test_that("panel metrics and exported labels preserve the original behavior", {
    one <- matrix(c(0.2, 1), nrow = 1, dimnames = list("FITC", c("B1-A", "B2-A")))
    two <- rbind(FITC = c(0.2, 1), PE = c(1, 0.1))
    colnames(two) <- c("B1-A", "YG1-A")
    zero <- matrix(0, 2, 2, dimnames = list(c("A", "B"), c("B1-A", "B2-A")))

    expect_equal(openpanel:::.calculate_panel_complexity(one), 1)
    expect_true(is.finite(openpanel:::.calculate_panel_complexity(two)))
    expect_true(is.na(openpanel:::.calculate_panel_complexity(zero)))
    expect_equal(
        openpanel:::.spectral_panel_label_rows(c("FITC", "PE", "PE"), c("CD3", "", "")),
        c("CD3 / FITC", "PE", "PE 1")
    )
    expect_equal(
        openpanel:::.spectral_panel_export_table(c(" FITC ", "", "PE"), c(" CD3 ", NA, "ignored")),
        data.frame(Marker = c("CD3", ""), Fluorophore = c("FITC", "PE"))
    )
})

test_that("detector metadata fallbacks and configuration filtering remain intact", {
    laser_for <- function(detector) {
        testthat::with_mocked_bindings(
            openpanel:::.spectral_detector_laser("aurora", detector),
            .read_cytometer_dictionary = function() data.frame(),
            .package = "openpanel"
        )
    }
    expect_equal(
        unname(vapply(c("320CH1", "UV1", "V1", "B1", "YG1", "R1", "IR1", "X1"), laser_for, character(1))),
        c("DeepUV", "UV", "Violet", "Blue", "YellowGreen", "Red", "IR", "Other")
    )

    full <- matrix(
        c(1, 0.5, 0.001, 0),
        nrow = 2,
        byrow = TRUE,
        dimnames = list(c("FITC", "DIM"), c("B1-A", "R1-A"))
    )
    expect_error(
        testthat::with_mocked_bindings(
            openpanel:::.spectral_panel_configuration_spectra(
                "aurora",
                fluorophores = c("FITC", "DIM"),
                strict = TRUE
            ),
            .load_spectral_library = function(...) full,
            .spectral_panel_configuration_detectors = function(...) colnames(full),
            .package = "openpanel"
        ),
        "too little signal.*DIM"
    )
})

test_that("PDF overview export writes the extracted report", {
    output <- tempfile(fileext = ".pdf")
    expect_equal(
        openpanel:::.write_spectral_panel_overview_pdf(
            cytometer = "aurora",
            fluorophores = c("Alexa Fluor 488", "Alexa Fluor 647"),
            markers = c("CD3", "CD19"),
            output_file = output
        ),
        output
    )
    expect_true(file.exists(output))
    expect_gt(file.info(output)$size, 1000)
})
