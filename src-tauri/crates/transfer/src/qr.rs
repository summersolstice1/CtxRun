use qrcode::{QrCode, types::Color};

use crate::error::{Result, TransferError};

pub fn build_qr_matrix(content: &str) -> Result<Vec<Vec<bool>>> {
    let qr = QrCode::new(content.as_bytes())
        .map_err(|err| TransferError::Message(format!("Failed to generate QR code: {err}")))?;
    let width = qr.width();
    let mut matrix = vec![vec![false; width]; width];

    for y in 0..width {
        for x in 0..width {
            matrix[y][x] = matches!(qr[(x, y)], Color::Dark);
        }
    }

    Ok(matrix)
}

#[cfg(test)]
mod tests {
    use super::build_qr_matrix;

    #[test]
    fn qr_matrix_is_square_and_non_empty() {
        let matrix = build_qr_matrix("http://127.0.0.1:18900/t").expect("generate qr matrix");
        assert!(!matrix.is_empty());
        assert_eq!(matrix.len(), matrix[0].len());
    }
}
