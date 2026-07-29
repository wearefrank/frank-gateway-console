package wearefrank.backend.service.versioning;

import java.io.ByteArrayOutputStream;
import java.net.http.HttpRequest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

// Reads the actual body text out of an HttpRequest's BodyPublisher, so tests can assert
// on the JSON payload sent to the Git provider API instead of only the HTTP method/URL.
final class TestHttpBodies {

    private TestHttpBodies() {
    }

    static String bodyOf(HttpRequest request) throws Exception {
        HttpRequest.BodyPublisher publisher = request.bodyPublisher()
                .orElseThrow(() -> new AssertionError("Request has no body: " + request));
        ByteArrayOutputStream collected = new ByteArrayOutputStream();
        CompletableFuture<Void> done = new CompletableFuture<>();

        publisher.subscribe(new Flow.Subscriber<>() {
            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer item) {
                byte[] bytes = new byte[item.remaining()];
                item.get(bytes);
                collected.writeBytes(bytes);
            }

            @Override
            public void onError(Throwable throwable) {
                done.completeExceptionally(throwable);
            }

            @Override
            public void onComplete() {
                done.complete(null);
            }
        });

        done.get(1, TimeUnit.SECONDS);
        return collected.toString(StandardCharsets.UTF_8);
    }
}
