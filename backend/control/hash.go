package control

import (
    "bytes"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "sort"
)

// CanonicalizeJSON returns a deterministic JSON encoding with sorted keys.
func CanonicalizeJSON(in []byte) ([]byte, error) {
    var v interface{}
    dec := json.NewDecoder(bytes.NewReader(in))
    dec.UseNumber()
    if err := dec.Decode(&v); err != nil {
        return nil, err
    }
    buf := &bytes.Buffer{}
    if err := writeCanonicalJSON(buf, v); err != nil {
        return nil, err
    }
    return buf.Bytes(), nil
}

func writeCanonicalJSON(buf *bytes.Buffer, v interface{}) error {
    switch t := v.(type) {
    case map[string]interface{}:
        keys := make([]string, 0, len(t))
        for k := range t {
            keys = append(keys, k)
        }
        sort.Strings(keys)
        buf.WriteByte('{')
        for i, k := range keys {
            if i > 0 {
                buf.WriteByte(',')
            }
            kb, _ := json.Marshal(k)
            buf.Write(kb)
            buf.WriteByte(':')
            if err := writeCanonicalJSON(buf, t[k]); err != nil {
                return err
            }
        }
        buf.WriteByte('}')
    case []interface{}:
        buf.WriteByte('[')
        for i, elem := range t {
            if i > 0 {
                buf.WriteByte(',')
            }
            if err := writeCanonicalJSON(buf, elem); err != nil {
                return err
            }
        }
        buf.WriteByte(']')
    case json.Number:
        buf.WriteString(t.String())
    case string:
        b, _ := json.Marshal(t)
        buf.Write(b)
    case bool:
        if t {
            buf.WriteString("true")
        } else {
            buf.WriteString("false")
        }
    case nil:
        buf.WriteString("null")
    default:
        b, _ := json.Marshal(t)
        buf.Write(b)
    }
    return nil
}

// ComputeETag computes a strong ETag over bytes. For JSON content, provide canonicalized bytes.
func ComputeETag(b []byte) string {
    sum := sha256.Sum256(b)
    return "\"sha256:" + hex.EncodeToString(sum[:]) + "\""
}

