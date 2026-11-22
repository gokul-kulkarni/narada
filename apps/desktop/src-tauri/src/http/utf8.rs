/// Decodes a byte stream as UTF-8 piece by piece, holding back a character split across
/// pieces. Once invalid UTF-8 shows up the body is binary and is decoded lossily.
#[derive(Default)]
pub struct Utf8Stream {
    pending: Vec<u8>,
    binary: bool,
}

impl Utf8Stream {
    pub fn is_binary(&self) -> bool {
        self.binary
    }

    pub fn push(&mut self, bytes: &[u8]) -> String {
        let buffer = [std::mem::take(&mut self.pending).as_slice(), bytes].concat();
        if self.binary {
            return String::from_utf8_lossy(&buffer).into_owned();
        }
        match std::str::from_utf8(&buffer) {
            Ok(text) => text.to_owned(),
            Err(error) if error.error_len().is_none() => {
                let (valid, rest) = buffer.split_at(error.valid_up_to());
                self.pending = rest.to_vec();
                String::from_utf8_lossy(valid).into_owned()
            }
            Err(_) => {
                self.binary = true;
                String::from_utf8_lossy(&buffer).into_owned()
            }
        }
    }

    /// Whatever is still held back; a dangling partial character makes the body binary.
    pub fn finish(&mut self) -> String {
        if self.pending.is_empty() {
            return String::new();
        }
        self.binary = true;
        String::from_utf8_lossy(&std::mem::take(&mut self.pending)).into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::Utf8Stream;

    #[test]
    fn holds_back_a_character_split_across_pieces() {
        let mut stream = Utf8Stream::default();
        let bytes = "é!".as_bytes();
        assert_eq!(stream.push(&bytes[..1]), "");
        assert_eq!(stream.push(&bytes[1..]), "é!");
        assert_eq!(stream.finish(), "");
        assert!(!stream.is_binary());
    }

    #[test]
    fn marks_invalid_bytes_as_binary() {
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(b"a\xff"), "a\u{fffd}");
        assert!(stream.is_binary());
        assert_eq!(stream.push(b"b"), "b");
    }

    #[test]
    fn a_dangling_partial_character_is_binary() {
        let mut stream = Utf8Stream::default();
        stream.push(&"é".as_bytes()[..1]);
        assert_eq!(stream.finish(), "\u{fffd}");
        assert!(stream.is_binary());
    }
}
