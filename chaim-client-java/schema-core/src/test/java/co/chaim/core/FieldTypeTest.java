package co.chaim.core;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.*;

public class FieldTypeTest {

  @Test
  void shouldHaveCorrectEnumValues() {
    FieldType[] values = FieldType.values();
    assertThat(values).extracting(FieldType::name)
        .containsExactlyInAnyOrder("string", "number", "bool", "boolean_", "binary", "timestamp",
            "list", "map", "stringSet", "numberSet");
  }

  @Test
  void shouldValidateBaretypes() {
    assertThat(FieldType.isValid("string")).isTrue();
    assertThat(FieldType.isValid("number")).isTrue();
    assertThat(FieldType.isValid("bool")).isTrue();
    assertThat(FieldType.isValid("boolean")).isTrue();
    assertThat(FieldType.isValid("binary")).isTrue();
    assertThat(FieldType.isValid("timestamp")).isTrue();
    assertThat(FieldType.isValid("list")).isTrue();
    assertThat(FieldType.isValid("map")).isTrue();
    assertThat(FieldType.isValid("stringSet")).isTrue();
    assertThat(FieldType.isValid("numberSet")).isTrue();
  }

  @Test
  void shouldValidateNumberSubtypes() {
    assertThat(FieldType.isValid("number.int")).isTrue();
    assertThat(FieldType.isValid("number.long")).isTrue();
    assertThat(FieldType.isValid("number.float")).isTrue();
    assertThat(FieldType.isValid("number.double")).isTrue();
    assertThat(FieldType.isValid("number.decimal")).isTrue();
  }

  @Test
  void shouldValidateNumberSetSubtypes() {
    assertThat(FieldType.isValid("numberSet.int")).isTrue();
    assertThat(FieldType.isValid("numberSet.long")).isTrue();
    assertThat(FieldType.isValid("numberSet.float")).isTrue();
    assertThat(FieldType.isValid("numberSet.double")).isTrue();
    assertThat(FieldType.isValid("numberSet.decimal")).isTrue();
  }

  @Test
  void shouldValidateTimestampSubtypes() {
    assertThat(FieldType.isValid("timestamp.epoch")).isTrue();
    assertThat(FieldType.isValid("timestamp.date")).isTrue();
  }

  @Test
  void shouldRejectInvalidBareTypes() {
    assertThat(FieldType.isValid("int")).isFalse();
    assertThat(FieldType.isValid("float")).isFalse();
    assertThat(FieldType.isValid("double")).isFalse();
    assertThat(FieldType.isValid("long")).isFalse();
    assertThat(FieldType.isValid("date")).isFalse();
    assertThat(FieldType.isValid("datetime")).isFalse();
    assertThat(FieldType.isValid("blob")).isFalse();
  }

  @Test
  void shouldRejectInvalidSubtypes() {
    // Valid prefix, invalid suffix
    assertThat(FieldType.isValid("number.bigDecimal")).isFalse();  // legacy name, now "decimal"
    assertThat(FieldType.isValid("number.integer")).isFalse();
    assertThat(FieldType.isValid("number.string")).isFalse();
    assertThat(FieldType.isValid("timestamp.instant")).isFalse();
    assertThat(FieldType.isValid("timestamp.datetime")).isFalse();
    assertThat(FieldType.isValid("numberSet.boolean")).isFalse();
  }

  @Test
  void shouldRejectDotOnTypesWithoutSubtypes() {
    // Types that don't support sub-types
    assertThat(FieldType.isValid("string.something")).isFalse();
    assertThat(FieldType.isValid("boolean.something")).isFalse();
    assertThat(FieldType.isValid("binary.something")).isFalse();
    assertThat(FieldType.isValid("list.something")).isFalse();
    assertThat(FieldType.isValid("map.something")).isFalse();
    assertThat(FieldType.isValid("stringSet.something")).isFalse();
  }

  @ParameterizedTest
  @ValueSource(strings = {"", " ", "  ", "\t", "\n"})
  void shouldRejectEmptyOrWhitespaceTypes(String invalidType) {
    assertThat(FieldType.isValid(invalidType)).isFalse();
  }

  @Test
  void shouldRejectNullType() {
    assertThat(FieldType.isValid(null)).isFalse();
  }

  @Test
  void shouldRejectCaseVariations() {
    assertThat(FieldType.isValid("String")).isFalse();
    assertThat(FieldType.isValid("STRING")).isFalse();
    assertThat(FieldType.isValid("Number")).isFalse();
    assertThat(FieldType.isValid("BOOL")).isFalse();
    assertThat(FieldType.isValid("Timestamp")).isFalse();
    assertThat(FieldType.isValid("Number.Int")).isFalse();
    assertThat(FieldType.isValid("NUMBER.INT")).isFalse();
  }

  @Test
  void shouldRejectPartialMatches() {
    assertThat(FieldType.isValid("str")).isFalse();
    assertThat(FieldType.isValid("num")).isFalse();
    assertThat(FieldType.isValid("bo")).isFalse();
    assertThat(FieldType.isValid("time")).isFalse();
    assertThat(FieldType.isValid("number.")).isFalse();  // dot but no suffix
  }

  @Test
  void shouldRejectSpecialCharacters() {
    assertThat(FieldType.isValid("string!")).isFalse();
    assertThat(FieldType.isValid("number@")).isFalse();
    assertThat(FieldType.isValid("bool#")).isFalse();
    assertThat(FieldType.isValid("timestamp$")).isFalse();
  }

  @Test
  void shouldRejectNumbers() {
    assertThat(FieldType.isValid("1")).isFalse();
    assertThat(FieldType.isValid("123")).isFalse();
    assertThat(FieldType.isValid("0")).isFalse();
  }

  @Test
  void shouldRejectCommonProgrammingTypes() {
    assertThat(FieldType.isValid("Integer")).isFalse();
    assertThat(FieldType.isValid("Long")).isFalse();
    assertThat(FieldType.isValid("Float")).isFalse();
    assertThat(FieldType.isValid("Double")).isFalse();
    assertThat(FieldType.isValid("BigDecimal")).isFalse();
    assertThat(FieldType.isValid("LocalDate")).isFalse();
    assertThat(FieldType.isValid("LocalDateTime")).isFalse();
    assertThat(FieldType.isValid("ZonedDateTime")).isFalse();
  }
}
