# samples/

Жинхэнэ банкны хуулга файлуудаа **энд** тавина. Энэ хавтас `.gitignore`-д
орсон — PII тул git-д **хэзээ ч орохгүй**.

## Файлын нэрлэх дүрэм

`<bank>-<он-сар>.<өргөтгөл>` хэлбэрээр:

```
samples/golomt-2025-04.xlsx
samples/golomt-2025-04.pdf
samples/xacbank-2025-04.xlsx
samples/khan-2025-04.pdf
samples/khan-2025-04.csv
samples/mbank-2025-04.csv
samples/tdb-2025-04.pdf
samples/arig-2025-04.xlsx
```

`<bank>` түлхүүрүүд: `golomt`, `xacbank`, `khan`, `mbank`, `tdb`, `arig`.

Банк тус бүрд **1 файл** хангалттай эхлэхэд. Олон формат (PDF + Excel)
байвал хоёуланг нь тавьж болно — аль ажиллахыг шалгана.

## Парсер бичсэний дараа

Файл бүрээс **anonymize** хийсэн жижиг fixture гаргаж
`src/parser/__fixtures__/`-д хадгална (данс/нэр/дүн өөрчилсөн) — тест
энэ дээр ажиллана, жинхэнэ файл repo-д орохгүй.
