package co.chaim.core;

import com.fasterxml.jackson.databind.ObjectMapper;
import co.chaim.core.model.BprintSchema;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class BprintLoader {
  private static final ObjectMapper JSON = new ObjectMapper();

  public static BprintSchema load(Path path) throws IOException {
    byte[] bytes = Files.readAllBytes(path);
    // MVP: treat all files as JSON
    BprintSchema s = JSON.readValue(bytes, BprintSchema.class);
    // Call full validation instead of just basic require check
    BprintValidator.validate(s);
    return s;
  }
}
